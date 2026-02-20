export const prerender = false;

import { getSessionToken, getSession, getUser } from '../../../lib/auth.js';

export async function GET({ request, locals }) {
  const env = locals.runtime?.env;
  if (!env?.USERS_DB || !env?.SESSIONS) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = getSessionToken(request);
  if (!token) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await getSession(env.SESSIONS, token);
  if (!session) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await getUser(env.USERS_DB, session.userId);
  if (!user) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isAdmin = env.SITE_ADMIN_EMAIL && user.email === env.SITE_ADMIN_EMAIL;

  return new Response(JSON.stringify({
    user: { email: user.email, name: user.name, tier: user.tier, picture: user.picture, isAdmin },
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
