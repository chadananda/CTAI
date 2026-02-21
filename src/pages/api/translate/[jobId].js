export const prerender = false;
export async function GET({ params, locals }) {
  try {
    const { jobId } = params;
    const user = locals.user;
    const db = locals.runtime?.env?.USERS_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const job = await db.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first();
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    // Only owner or admin can view job details
    if (!user || (job.user_id !== user.id && user.tier !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }
    // Get completed phases
    const phases = await db.prepare(
      'SELECT phase, agent_role, round, tokens_in, tokens_out, cost_usd, created_at FROM job_phases WHERE job_id = ? ORDER BY created_at'
    ).bind(jobId).all();
    // Get block-level progress
    const blocks = await db.prepare(
      'SELECT id, block_index, status, delib_round, cost_usd FROM job_blocks WHERE job_id = ? ORDER BY block_index'
    ).bind(jobId).all();
    // Get latest output if complete
    let output = null;
    if (job.status === 'complete') {
      const review = await db.prepare(
        "SELECT output_json FROM job_phases WHERE job_id = ? AND phase = 'review' ORDER BY created_at DESC LIMIT 1"
      ).bind(jobId).first();
      if (review?.output_json) {
        output = JSON.parse(review.output_json);
      }
    }
    return new Response(JSON.stringify({
      job: {
        id: job.id,
        status: job.status,
        style: job.style,
        sourceLang: job.source_lang,
        workTitle: job.work_title,
        estimatedCost: job.estimated_cost_usd,
        actualCost: job.actual_cost_usd,
        totalTokens: job.total_tokens,
        totalBlocks: job.total_blocks || 0,
        blocksDone: job.blocks_done || 0,
        delibRound: job.delib_round,
        errorMessage: job.error_message,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      },
      blocks: (blocks.results || []).map(b => ({
        id: b.id,
        index: b.block_index,
        status: b.status,
        delibRound: b.delib_round,
        cost: b.cost_usd,
      })),
      phases: phases.results,
      output,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/translate/jobId] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
