export const prerender = false;
export async function GET({ locals }) {
  try {
    const db = locals.runtime?.env?.USERS_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const sponsorships = await db.prepare(
      `SELECT id, work_id, work_title, estimated_cost_usd, funded_usd, status, created_at
       FROM sponsorships WHERE status IN ('seeking_funding', 'funded')
       ORDER BY created_at DESC`
    ).all();
    return new Response(JSON.stringify({ sponsorships: sponsorships.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
