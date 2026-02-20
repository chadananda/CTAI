export const prerender = false;

import { loadCostModel, saveCostModel, calibrateFromJobs } from '../../../lib/agents/cost-estimator.js';

// GET: View current cost model + comparison with actual job data
export async function GET({ locals }) {
  const env = locals.runtime?.env;
  const kv = env?.SESSIONS;
  const db = env?.USERS_DB;

  const model = await loadCostModel(kv);

  // Pull actual cost data from completed jobs for comparison
  let actuals = null;
  if (db) {
    const jobs = await db.prepare(
      `SELECT tj.id, tj.actual_cost_usd, tj.estimated_cost_usd, tj.total_tokens, tj.source_lang,
              LENGTH(tj.source_text) as char_count,
              (SELECT COUNT(*) FROM job_phases jp WHERE jp.job_id = tj.id) as phase_count
       FROM translation_jobs tj WHERE tj.status = 'complete' ORDER BY tj.completed_at DESC LIMIT 50`
    ).all();

    if (jobs.results?.length) {
      const totalEstimated = jobs.results.reduce((s, j) => s + (j.estimated_cost_usd || 0), 0);
      const totalActual = jobs.results.reduce((s, j) => s + (j.actual_cost_usd || 0), 0);
      actuals = {
        jobCount: jobs.results.length,
        totalEstimated: Math.round(totalEstimated * 100) / 100,
        totalActual: Math.round(totalActual * 100) / 100,
        accuracy: totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : null,
        jobs: jobs.results.map(j => ({
          id: j.id,
          estimated: j.estimated_cost_usd,
          actual: j.actual_cost_usd,
          tokens: j.total_tokens,
          lang: j.source_lang,
          chars: j.char_count,
          phases: j.phase_count,
        })),
      };
    }
  }

  return new Response(JSON.stringify({ model, actuals }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// PUT: Manually update cost model rates
export async function PUT({ request, locals }) {
  const env = locals.runtime?.env;
  const kv = env?.SESSIONS;
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV not available' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates = await request.json();
  const current = await loadCostModel(kv);

  // Merge updates into current model
  if (updates.costs) {
    current.costs = { ...current.costs, ...updates.costs };
  }
  if (updates.charsPerPara) {
    current.charsPerPara = { ...current.charsPerPara, ...updates.charsPerPara };
  }
  if (updates.cushion !== undefined) {
    current.cushion = updates.cushion;
  }
  if (updates.calibrationNote) {
    current.calibrationNote = updates.calibrationNote;
  }
  current.lastCalibrated = new Date().toISOString();

  await saveCostModel(kv, current);

  return new Response(JSON.stringify({ model: current }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST: Auto-calibrate from completed job data
export async function POST({ locals }) {
  const env = locals.runtime?.env;
  const kv = env?.SESSIONS;
  const db = env?.USERS_DB;

  if (!kv || !db) {
    return new Response(JSON.stringify({ error: 'KV or DB not available' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Load completed jobs with phase-level cost breakdown
  const jobRows = await db.prepare(
    "SELECT id, source_lang, LENGTH(source_text) as char_count FROM translation_jobs WHERE status = 'complete'"
  ).all();

  if (!jobRows.results?.length) {
    return new Response(JSON.stringify({ error: 'No completed jobs to calibrate from' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobs = [];
  for (const row of jobRows.results) {
    const phases = await db.prepare(
      'SELECT phase, cost_usd FROM job_phases WHERE job_id = ?'
    ).bind(row.id).all();

    const charsPerPara = row.source_lang === 'fa' ? 450 : 400;
    const paragraphCount = Math.max(1, Math.ceil(row.char_count / charsPerPara));

    jobs.push({
      id: row.id,
      paragraphCount,
      phases: phases.results,
    });
  }

  const current = await loadCostModel(kv);
  const calibrated = calibrateFromJobs(jobs, current);
  await saveCostModel(kv, calibrated);

  return new Response(JSON.stringify({
    previous: current,
    calibrated,
    jobsUsed: jobs.length,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
