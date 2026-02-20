export const prerender = false;

export async function GET({ locals }) {
  const db = locals.runtime?.env?.USERS_DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB unavailable' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  const recent = await db.prepare(
    `SELECT id, user_id, status, style, source_lang, work_title,
            estimated_cost_usd, actual_cost_usd, total_tokens,
            created_at, completed_at
     FROM translation_jobs ORDER BY created_at DESC LIMIT 50`
  ).all();
  const stats = await db.prepare(
    `SELECT status, COUNT(*) as count FROM translation_jobs GROUP BY status`
  ).all();
  return new Response(JSON.stringify({
    jobs: recent.results,
    stats: stats.results,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
