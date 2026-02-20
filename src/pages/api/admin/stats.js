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
    // Get total user count
    const userCountResult = await db.prepare('SELECT COUNT(*) as count FROM users').first();
    const totalUsers = userCountResult?.count || 0;
    // Get monthly usage stats
    const monthlyStatsResult = await db.prepare(
      "SELECT service, COUNT(*) as requests, SUM(cost_usd) as cost FROM usage_log WHERE created_at >= date('now', 'start of month') GROUP BY service"
    ).all();
    const monthlyStats = monthlyStatsResult.results || [];
    return new Response(JSON.stringify({
      userCount: totalUsers,
      monthly: monthlyStats
    }), {
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
