export const prerender = false;

export async function DELETE({ params, locals }) {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = locals.runtime.env.USERS_DB;
  const keyId = params.id;

  // Verify ownership before revoking
  const key = await db.prepare(
    'SELECT id FROM api_keys WHERE id = ? AND user_id = ?'
  ).bind(keyId, user.id).first();

  if (!key) {
    return new Response(JSON.stringify({ error: 'Key not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  await db.prepare(
    'UPDATE api_keys SET revoked = 1 WHERE id = ?'
  ).bind(keyId).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
