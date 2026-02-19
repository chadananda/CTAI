export const prerender = false;

import { generateApiKey, generateId } from '../../../lib/auth.js';

export async function POST({ locals }) {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = locals.runtime.env.USERS_DB;
  const body = {}; // name is optional, default handled by DB
  const { key, hash, prefix } = await generateApiKey();
  const id = generateId();

  await db.prepare(
    'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.id, hash, prefix, body.name || 'Default').run();

  return new Response(JSON.stringify({ id, key, prefix }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ locals }) {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = locals.runtime.env.USERS_DB;
  const { results } = await db.prepare(
    'SELECT id, key_prefix, name, created_at, last_used, revoked FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all();

  return new Response(JSON.stringify({ keys: results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
