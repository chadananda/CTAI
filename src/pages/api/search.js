export const prerender = false;

import { searchPhrases, searchConcepts } from '../../lib/meili.js';

export async function GET({ url }) {
  const query = url.searchParams.get('q') || '';
  const index = url.searchParams.get('index') || 'phrases';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

  if (!query.trim()) {
    return new Response(JSON.stringify({ hits: [], query: '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const searchFn = index === 'concepts' ? searchConcepts : searchPhrases;
    const result = await searchFn(query, { limit });

    return new Response(JSON.stringify({
      hits: result.hits,
      query: result.query,
      processingTimeMs: result.processingTimeMs,
      estimatedTotalHits: result.estimatedTotalHits,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Search unavailable', hits: [] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
