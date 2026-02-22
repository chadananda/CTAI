export const prerender = false;

import { requireAdmin } from '../../../lib/admin.js';
import { runSegmentation } from '../../../../workers/translation-pipeline/segmentation.js';
import {
  calculateCost, parseAIJson,
  ANTHROPIC_API, MODEL,
} from '../../../../workers/translation-pipeline/utils.js';

async function callAnthropic({ apiKey, system, messages, maxTokens = 4096, json = false }) {
  const systemPrompt = json
    ? `${system}\n\nYou MUST respond with valid JSON only. No commentary, no markdown fences.`
    : system;
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const response = await res.json();
  const text = response.content[0].text;
  const usage = response.usage || {};
  const cost = calculateCost(usage.input_tokens, usage.output_tokens);
  const result = { text, tokensIn: usage.input_tokens || 0, tokensOut: usage.output_tokens || 0, cost };
  if (json) result.data = parseAIJson(text);
  return result;
}

export async function POST({ request, locals }) {
  const auth = requireAdmin(locals);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status, headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = locals.runtime?.env;
  const apiKey = env?.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = env?.USERS_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { text, lang, maxChars = 5000 } = body;
  if (!text || typeof text !== 'string') {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (lang !== 'ar' && lang !== 'fa') {
    return new Response(JSON.stringify({ error: "lang must be 'ar' or 'fa'" }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await runSegmentation({
    text,
    lang,
    truncate: { maxChars, dropLastPhrase: true },
    llmCall: async ({ phase, system, userContent }) => {
      const res = await callAnthropic({
        apiKey, system,
        messages: [{ role: 'user', content: userContent }],
        json: true,
      });
      // Best-effort logging
      if (db) {
        try {
          const id = crypto.randomUUID().replace(/-/g, '').slice(0, 21);
          await db.prepare(
            `INSERT INTO api_call_log (id, job_id, phase, agent_role, model, prompt_chars, response_chars, tokens_in, tokens_out, cost_usd, duration_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(id, 'sample', `sample_${phase}`, 'segmenter', MODEL,
            userContent.length, res.text.length, res.tokensIn, res.tokensOut, res.cost, 0).run();
        } catch { /* best effort */ }
      }
      return res;
    },
  });

  const projectedFullCost = result.sampleChars > 0
    ? result.cost.total * (result.totalChars / result.sampleChars)
    : result.cost.total;

  return new Response(JSON.stringify({
    words: result.words,
    phraseStarts: result.phraseStarts,
    sentenceStarts: result.sentenceStarts,
    paragraphStarts: result.paragraphStarts,
    structured: result.structured,
    cost: { total: Math.round(result.cost.total * 1e6) / 1e6, passes: result.cost.passes },
    tokens: result.tokens,
    sampleChars: result.sampleChars,
    totalChars: result.totalChars,
    projectedFullCost: Math.round(projectedFullCost * 1e4) / 1e4,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
