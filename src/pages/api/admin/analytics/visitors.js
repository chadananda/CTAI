export const prerender = false;

import { getVisitorGeo, getPageviews } from '../../../../lib/posthog-admin.js';

export async function GET({ locals, url }) {
  const apiKey = locals.runtime?.env?.POSTHOG_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'PostHog API key not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  const days = Number(url.searchParams.get('days')) || 30;
  try {
    const [geo, pageviews] = await Promise.all([
      getVisitorGeo({ apiKey, days }),
      getPageviews({ apiKey, days }),
    ]);
    return new Response(JSON.stringify({ geo, pageviews }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
