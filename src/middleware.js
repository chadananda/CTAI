import { getSessionToken, getSession, hashApiKey, resolveApiKey, getUser } from './lib/auth.js';

export async function onRequest({ request, locals, url }, next) {
  const env = locals.runtime?.env;
  const db = env?.USERS_DB;
  const kv = env?.SESSIONS;
  // Phase 1: Resolve session user for ALL requests (except static assets)
  const hasFileExtension = /\.[a-z0-9]+$/i.test(url.pathname);
  if (!hasFileExtension && db && kv) {
    const token = getSessionToken(request);
    if (token) {
      const session = await getSession(kv, token);
      if (session) {
        const user = await getUser(db, session.userId);
        if (user) {
          locals.user = user;
        }
      }
    }
  }
  // Phase 2: Gate /admin/* routes
  if (url.pathname.startsWith('/admin')) {
    if (!locals.user) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/dashboard' },
      });
    }
    if (locals.user.email !== env?.SITE_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  // Phase 3: Gate /api/* routes (existing logic)
  const isPublicApi = !url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/api/auth/')
    || url.pathname.startsWith('/api/research')
    || url.pathname === '/api/billing/webhook'
    || (request.method === 'GET' && url.pathname.startsWith('/api/translations'))
    || (request.method === 'GET' && url.pathname.startsWith('/api/sponsorships'))
    || (request.method === 'GET' && url.pathname === '/api/email/unsubscribe');
  if (isPublicApi) {
    return next();
  }
  if (!db || !kv) {
    return next();
  }
  // Try API key first (Bearer token) — overrides session user
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
  // Check if session user was already resolved in Phase 1
  if (locals.user) {
    return next();
  }
  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
