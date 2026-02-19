export const prerender = false;

export async function GET({ locals }) {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = locals.runtime.env.USERS_DB;

  // Current billing period (first of this month)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Usage by service
  const { results: byService } = await db.prepare(
    `SELECT service, COUNT(*) as requests, SUM(tokens_in) as total_tokens_in,
     SUM(tokens_out) as total_tokens_out, SUM(cost_usd) as total_cost
     FROM usage_log WHERE user_id = ? AND created_at >= ?
     GROUP BY service`
  ).bind(user.id, periodStart).all();

  // Total cost
  const totals = byService.reduce((acc, s) => ({
    requests: acc.requests + s.requests,
    cost: acc.cost + s.total_cost,
  }), { requests: 0, cost: 0 });

  return new Response(JSON.stringify({
    period_start: periodStart,
    services: byService,
    totals,
    tier: user.tier,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
