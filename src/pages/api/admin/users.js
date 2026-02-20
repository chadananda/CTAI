export const prerender = false;
import { requireAdmin } from '../../../lib/admin.js';

export async function GET({ locals }) {
  const authCheck = requireAdmin(locals);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const db = locals.runtime.env.USERS_DB;
  try {
    const result = await db.prepare(`
      SELECT
        u.*,
        COALESCE(SUM(CASE WHEN ul.created_at >= date('now', 'start of month') THEN 1 ELSE 0 END), 0) as monthly_requests,
        COALESCE(SUM(CASE WHEN ul.created_at >= date('now', 'start of month') THEN ul.cost_usd ELSE 0 END), 0) as monthly_cost
      FROM users u
      LEFT JOIN usage_log ul ON u.id = ul.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    return new Response(JSON.stringify({ users: result.results || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
