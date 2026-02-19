export const prerender = false;

import { analyzePhrase } from '../../lib/research.js';
import { logUsage } from '../../lib/auth.js';

export async function POST({ request, locals }) {
  try {
    const body = await request.json();
    const { phrase, source_lang } = body;

    if (!phrase?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing "phrase" in request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Use D1 in production, better-sqlite3 in dev
    const d1 = import.meta.env.PROD ? (locals?.runtime?.env?.JAFAR_DB ?? null) : null;
    const result = await analyzePhrase(phrase, source_lang || 'ar', d1);

    // Log usage (concordance only, no AI cost)
    const usersDb = locals.runtime?.env?.USERS_DB;
    if (usersDb && locals.user) {
      await logUsage(usersDb, {
        userId: locals.user.id,
        keyId: locals.user.keyId || null,
        service: 'jafar',
      }).catch(err => console.error('[research] usage log failed:', err));
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/research] Error:', err);
    return new Response(JSON.stringify({ error: 'Research analysis failed', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
