// PostHog server-side API for admin analytics
// Uses Trends API for geo breakdown
const POSTHOG_API = 'https://us.posthog.com/api';

export async function getVisitorGeo({ apiKey, projectId = '127388', days = 30 }) {
  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const res = await fetch(`${POSTHOG_API}/projects/${projectId}/insights/trend/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      events: [{ id: '$pageview', type: 'events', math: 'dau' }],
      date_from: dateFrom,
      breakdown: '$geoip_country_code',
      breakdown_type: 'event',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PostHog API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.result || []).map(r => ({
    country: r.breakdown_value,
    count: r.aggregated_value || r.count || 0,
    data: r.data,
    labels: r.labels,
  })).sort((a, b) => b.count - a.count);
}

export async function getPageviews({ apiKey, projectId = '127388', days = 30 }) {
  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const res = await fetch(`${POSTHOG_API}/projects/${projectId}/insights/trend/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      events: [{ id: '$pageview', type: 'events', math: 'total' }],
      date_from: dateFrom,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.result?.[0] || {};
}
