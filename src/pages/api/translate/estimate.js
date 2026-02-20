export const prerender = false;

import { estimateCost, loadCostModel } from '../../../lib/agents/cost-estimator.js';

export async function POST({ request, locals }) {
  try {
    const { text, lang } = await request.json();
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

    // Load admin-tunable cost model from KV
    const kv = locals.runtime?.env?.SESSIONS;
    const model = await loadCostModel(kv);

    const estimate = estimateCost({ text, lang, model });
    return new Response(JSON.stringify(estimate), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
