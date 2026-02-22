export const prerender = false;
import { requireAdmin } from '../../../lib/admin.js';

export async function GET({ locals, url }) {
  const authCheck = requireAdmin(locals);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const db = locals.runtime.env.USERS_DB;
  try {
    // Aggregate by phase
    const byPhase = await db.prepare(
      `SELECT phase, COUNT(*) as calls, SUM(tokens_in) as total_tokens_in,
              SUM(tokens_out) as total_tokens_out, SUM(cost_usd) as total_cost,
              AVG(cost_usd) as avg_cost, AVG(duration_ms) as avg_duration
       FROM api_call_log GROUP BY phase ORDER BY total_cost DESC`
    ).all();

    // Per-job breakdown (last 20 jobs)
    const recentJobs = await db.prepare(
      `SELECT j.id, j.work_title, j.status, j.actual_cost_usd, j.total_tokens,
              j.created_at, j.completed_at,
              COUNT(a.id) as api_calls, SUM(a.duration_ms) as total_duration
       FROM translation_jobs j
       LEFT JOIN api_call_log a ON a.job_id = j.id
       GROUP BY j.id ORDER BY j.created_at DESC LIMIT 20`
    ).all();

    // Per-call detail for a specific job (if ?jobId= provided)
    const jobIdParam = url.searchParams?.get('jobId');
    let jobCalls = null;
    if (jobIdParam) {
      const calls = await db.prepare(
        `SELECT id, phase, agent_role, model, prompt_chars, response_chars,
                tokens_in, tokens_out, cost_usd, duration_ms, created_at
         FROM api_call_log WHERE job_id = ? ORDER BY created_at`
      ).bind(jobIdParam).all();
      jobCalls = calls.results || [];
    }

    // Totals
    const totals = await db.prepare(
      `SELECT COUNT(*) as total_calls, SUM(cost_usd) as total_cost,
              SUM(tokens_in) as total_tokens_in, SUM(tokens_out) as total_tokens_out
       FROM api_call_log`
    ).first();

    return new Response(JSON.stringify({
      totals: totals || {},
      byPhase: byPhase.results || [],
      recentJobs: recentJobs.results || [],
      jobCalls,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
