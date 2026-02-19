export const prerender = false;

import { getSessionToken, deleteSession, sessionCookie } from '../../../lib/auth.js';

export async function POST({ request, locals }) {
  const env = locals.runtime?.env;
  const kv = env?.SESSIONS;
  const token = getSessionToken(request);

  if (kv && token) {
    await deleteSession(kv, token);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(null),
    },
  });
}
