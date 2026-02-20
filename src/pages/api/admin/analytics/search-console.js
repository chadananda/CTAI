export const prerender = false;

import { getSearchAnalytics } from '../../../../lib/search-console.js';

export async function GET({ locals, url }) {
  const gscJson = locals.runtime?.env?.GSC_SERVICE_ACCOUNT_JSON;
  if (!gscJson) {
    return new Response(JSON.stringify({ error: 'GSC service account not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  const days = Number(url.searchParams.get('days')) || 28;
  try {
    const data = await getSearchAnalytics({ serviceAccountJson: gscJson, days });
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
