import { getSessionToken, getSession, hashApiKey, resolveApiKey, getUser } from './lib/auth.js';

export async function onRequest({ request, locals, url }, next) {
  // Only gate /api/* routes (except /api/auth/* which handles login)
  if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/auth/')) {
    return next();
  }

  const env = locals.runtime?.env;
  if (!env?.USERS_DB || !env?.SESSIONS) {
    // Bindings not available (local dev without wrangler) — pass through
    return next();
  }

  const db = env.USERS_DB;
  const kv = env.SESSIONS;

  // Try API key first (Bearer token)
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ctai_')) {
    const apiKey = authHeader.slice(7);
    const keyHash = await hashApiKey(apiKey);
    const user = await resolveApiKey(db, keyHash);
    if (user) {
      locals.user = user;
      return next();
    }
    return new Response(JSON.stringify({ error: 'Invalid or revoked API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Try session cookie
  const token = getSessionToken(request);
  if (token) {
    const session = await getSession(kv, token);
    if (session) {
      const user = await getUser(db, session.userId);
      if (user) {
        locals.user = user;
        return next();
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
