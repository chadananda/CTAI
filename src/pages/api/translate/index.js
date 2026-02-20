export const prerender = false;
import { generateId } from '../../../lib/auth.js';
import { estimateCost } from '../../../lib/agents/cost-estimator.js';
export async function POST({ request, locals }) {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    const { text, lang, style = 'literary', workTitle, workId, stripePaymentId } = await request.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: 'Source text is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!['ar', 'fa'].includes(lang)) {
      return new Response(JSON.stringify({ error: 'Language must be ar or fa' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const estimate = estimateCost({ text, lang });
    const db = locals.runtime?.env?.USERS_DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const jobId = generateId();
    await db.prepare(
      `INSERT INTO translation_jobs (id, user_id, source_text, source_lang, style, status, estimated_cost_usd, stripe_payment_id, work_title, work_id)
       VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`
    ).bind(jobId, user.id, text, lang, style, estimate.totalCost, stripePaymentId || null, workTitle || null, workId || null).run();
    // Enqueue first pipeline step
    const queue = locals.runtime?.env?.TRANSLATION_QUEUE;
    if (queue) {
      await queue.send({ jobId, step: 'segment_phrases' });
    }
    return new Response(JSON.stringify({ jobId, estimate }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/translate] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
