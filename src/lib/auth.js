// Google JWT verification + session/API key helpers
// All Cloudflare Workers compatible (Web Crypto API, no Node.js crypto)

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let cachedCerts = null;
let certsExpiry = 0;

// --- Google JWT Verification ---

async function getGoogleCerts() {
  if (cachedCerts && Date.now() < certsExpiry) return cachedCerts;
  const res = await fetch(GOOGLE_CERTS_URL);
  const data = await res.json();
  cachedCerts = {};
  for (const key of data.keys) {
    cachedCerts[key.kid] = await crypto.subtle.importKey(
      'jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
  }
  // Cache for 1 hour
  certsExpiry = Date.now() + 3600_000;
  return cachedCerts;
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

function decodeJwtPayload(token) {
  const [, payloadB64] = token.split('.');
  const json = new TextDecoder().decode(base64UrlDecode(payloadB64));
  return JSON.parse(json);
}

export async function verifyGoogleToken(idToken, clientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
  const header = JSON.parse(headerJson);
  const payload = decodeJwtPayload(idToken);

  // Verify claims
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
    throw new Error('Invalid issuer');
  }
  if (payload.aud !== clientId) {
    throw new Error('Invalid audience');
  }
  if (payload.exp * 1000 < Date.now()) {
    throw new Error('Token expired');
  }

  // Verify signature
  const certs = await getGoogleCerts();
  const key = certs[header.kid];
  if (!key) throw new Error('Unknown signing key');

  const signatureBytes = base64UrlDecode(parts[2]);
  const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, signedContent);
  if (!valid) throw new Error('Invalid signature');

  return {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    googleId: payload.sub,
  };
}

// --- ID Generation ---

export function generateId(length = 21) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// --- Session Management (KV-backed) ---

export async function createSession(kv, userId, email) {
  const token = crypto.randomUUID();
  await kv.put(`sessions:${token}`, JSON.stringify({ userId, email }), {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days
  });
  return token;
}

export async function getSession(kv, token) {
  if (!token) return null;
  const data = await kv.get(`sessions:${token}`, 'json');
  return data; // { userId, email } or null
}

export async function deleteSession(kv, token) {
  if (!token) return;
  await kv.delete(`sessions:${token}`);
}

export function sessionCookie(token, maxAge = 7 * 24 * 60 * 60) {
  if (!token) {
    return 'ctai_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  }
  return `ctai_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function getSessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/ctai_session=([^;]+)/);
  return match ? match[1] : null;
}

// --- API Key Helpers ---

async function sha256(text) {
  const encoded = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateApiKey() {
  const key = `ctai_${crypto.randomUUID()}`;
  const hash = await sha256(key);
  const prefix = key.slice(0, 13); // "ctai_" + 8 chars
  return { key, hash, prefix };
}

export async function hashApiKey(key) {
  return sha256(key);
}

export async function resolveApiKey(db, keyHash) {
  const result = await db.prepare(
    'SELECT ak.id as key_id, ak.user_id, ak.revoked, u.id, u.email, u.name, u.tier FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ?'
  ).bind(keyHash).first();
  if (!result || result.revoked) return null;
  // Update last_used
  await db.prepare('UPDATE api_keys SET last_used = datetime(\'now\') WHERE key_hash = ?').bind(keyHash).run();
  return {
    id: result.user_id,
    email: result.email,
    name: result.name,
    tier: result.tier,
    keyId: result.key_id,
  };
}

// --- User Management (D1) ---

export async function upsertUser(db, { email, name, picture, googleId }) {
  const existing = await db.prepare('SELECT id FROM users WHERE google_id = ?').bind(googleId).first();
  if (existing) {
    await db.prepare(
      'UPDATE users SET name = ?, picture = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(name, picture, existing.id).run();
    return existing.id;
  }
  const id = generateId();
  await db.prepare(
    'INSERT INTO users (id, email, name, picture, google_id) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email, name, picture, googleId).run();
  return id;
}

export async function getUser(db, userId) {
  return db.prepare(
    'SELECT id, email, name, picture, tier, created_at FROM users WHERE id = ?'
  ).bind(userId).first();
}

// --- Usage Logging ---

export async function logUsage(db, { userId, keyId, service, tokensIn = 0, tokensOut = 0, costUsd = 0 }) {
  await db.prepare(
    'INSERT INTO usage_log (user_id, key_id, service, tokens_in, tokens_out, cost_usd) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, keyId || null, service, tokensIn, tokensOut, costUsd).run();
}
