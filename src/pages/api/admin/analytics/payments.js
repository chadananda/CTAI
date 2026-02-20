export const prerender = false;

export async function GET({ locals }) {
  const db = locals.runtime?.env?.USERS_DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB unavailable' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  const recent = await db.prepare(
    `SELECT id, type, amount_usd, status, document_title, created_at
     FROM payments ORDER BY created_at DESC LIMIT 50`
  ).all();
  const byType = await db.prepare(
    `SELECT type, SUM(amount_usd) as total, COUNT(*) as count
     FROM payments WHERE status = 'completed' GROUP BY type`
  ).all();
  const totalRevenue = await db.prepare(
    `SELECT SUM(amount_usd) as total FROM payments WHERE status = 'completed'`
  ).first();
  return new Response(JSON.stringify({
    payments: recent.results,
    byType: byType.results,
    totalRevenue: totalRevenue?.total || 0,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
