export const prerender = false;
export async function GET({ locals }) {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    const db = locals.runtime?.env?.USERS_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const payments = await db.prepare(
      `SELECT id, type, amount_usd, status, document_title, created_at
       FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    ).bind(user.id).all();
    return new Response(JSON.stringify({ payments: payments.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
