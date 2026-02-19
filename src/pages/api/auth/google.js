export const prerender = false;

import { verifyGoogleToken, upsertUser, createSession, sessionCookie, getUser } from '../../../lib/auth.js';

export async function POST({ request, locals }) {
  try {
    const { credential } = await request.json();
    if (!credential) {
      return new Response(JSON.stringify({ error: 'Missing credential' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const env = locals.runtime?.env;
    const clientId = env?.GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Google OAuth not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const googleUser = await verifyGoogleToken(credential, clientId);
    const db = env.USERS_DB;
    const kv = env.SESSIONS;

    const userId = await upsertUser(db, {
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      googleId: googleUser.googleId,
    });

    const token = await createSession(kv, userId, googleUser.email);
    const user = await getUser(db, userId);

    return new Response(JSON.stringify({ user: { email: user.email, name: user.name, tier: user.tier, picture: user.picture } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(token),
      },
    });
  } catch (err) {
    console.error('[api/auth/google] Error:', err);
    return new Response(JSON.stringify({ error: 'Authentication failed', detail: err.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
