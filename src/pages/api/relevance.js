export const prerender = false;

import { logUsage } from '../../lib/auth.js';

export async function POST({ request, locals }) {
  try {
    const { phrase, terms } = await request.json();

    if (!phrase?.trim() || !terms?.length) {
      return new Response(JSON.stringify({ terms: terms || [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ terms, error: 'No API key configured' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build a compact summary of terms + rows for the prompt
    const termSummaries = terms.map((term, i) => {
      const rows = (term.rows || []).map((r, j) =>
        `  [${j}] ${r.form} → "${r.en}" | src: ${(r.src || '').slice(0, 60)} | tr: ${(r.tr || '').slice(0, 60)} | ${r.ref}`
      ).join('\n');
      return `Term ${i}: ${term.word} (${term.root}, ${term.meaning})\n${rows}`;
    }).join('\n\n');

    // Direct fetch — works in Cloudflare Workers (no Node.js SDK needed)
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: 'You are a JSON API. Return ONLY valid JSON, no commentary.',
        messages: [{
          role: 'user',
          content: `Given this Arabic/Persian phrase being researched:
"${phrase}"

Here are concordance results showing how each word appears across Shoghi Effendi's translations:

${termSummaries}

Score each row 0-10 for relevance to the input phrase:
- 10: source passage contains the exact phrase or very close variant
- 7-9: source passage is thematically very related, rendering fits the context well
- 4-6: somewhat related, the rendering is plausible in this context
- 1-3: weakly related, different sense or distant context
- 0: clearly unrelated (homograph in a completely different sense)

Return JSON: { "scores": { "0": {"0":8,"1":3,"3":9}, "1": {"0":6,"2":7} } }
where outer keys are term indices, inner keys are row indices, values are scores 0-10.
Omit a term entirely if all its rows score 0.`
        }],
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      throw new Error(`Anthropic API ${apiRes.status}: ${errBody.slice(0, 200)}`);
    }

    const response = await apiRes.json();

    // Log usage with actual AI cost (Haiku pricing: $0.80/M input, $4.00/M output)
    const usersDb = locals.runtime?.env?.USERS_DB;
    if (usersDb && locals.user && response.usage) {
      const { input_tokens, output_tokens } = response.usage;
      const cost = (input_tokens * 0.80 + output_tokens * 4.00) / 1_000_000;
      await logUsage(usersDb, {
        userId: locals.user.id,
        keyId: locals.user.keyId || null,
        service: 'relevance',
        tokensIn: input_tokens,
        tokensOut: output_tokens,
        costUsd: cost,
      }).catch(err => console.error('[relevance] usage log failed:', err));
    }

    const text = response.content[0].text;
    let parsed;
    try {
      // Strip fences if present
      const cleaned = text.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Try extracting { ... } block
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last > first) {
        try { parsed = JSON.parse(text.slice(first, last + 1)); } catch {}
      }
    }

    const THRESHOLD = 4; // drop rows scoring below this

    if (parsed?.scores) {
      // Score-based: filter by threshold, sort by score descending
      const filteredTerms = [];
      for (let i = 0; i < terms.length; i++) {
        const termScores = parsed.scores[String(i)];
        if (!termScores) continue;
        const term = terms[i];
        const scored = Object.entries(termScores)
          .map(([j, score]) => ({ idx: Number(j), score }))
          .filter(({ idx, score }) => score >= THRESHOLD && idx >= 0 && idx < (term.rows || []).length)
          .sort((a, b) => b.score - a.score);
        if (scored.length > 0) {
          filteredTerms.push({ ...term, rows: scored.map(({ idx }) => term.rows[idx]) });
        }
      }
      return new Response(JSON.stringify({ terms: filteredTerms }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fallback: ranked/keep arrays (no scores)
    const ranking = parsed?.ranked || parsed?.keep;
    if (!ranking) {
      return new Response(JSON.stringify({ terms }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const filteredTerms = [];
    for (let i = 0; i < terms.length; i++) {
      const indices = ranking[String(i)];
      if (!indices) continue;
      const term = terms[i];
      const orderedRows = indices
        .filter(j => j >= 0 && j < (term.rows || []).length)
        .map(j => term.rows[j]);
      if (orderedRows.length > 0) {
        filteredTerms.push({ ...term, rows: orderedRows });
      }
    }

    return new Response(JSON.stringify({ terms: filteredTerms }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/relevance] Error:', err);
    return new Response(JSON.stringify({ error: 'Relevance filtering failed', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
