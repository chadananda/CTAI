// Stripe integration — direct fetch, no npm package (Workers-compatible)
// Uses Web Crypto API for webhook HMAC verification

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeRequest(path, { method = 'POST', body, secretKey }) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}

export async function createCheckoutSession({ secretKey, priceUsd, metadata, successUrl, cancelUrl, customerEmail }) {
  return stripeRequest('/checkout/sessions', {
    secretKey,
    body: {
      'mode': 'payment',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': metadata.description || 'CTAI Translation',
      'line_items[0][price_data][unit_amount]': String(Math.round(priceUsd * 100)),
      'line_items[0][quantity]': '1',
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      ...(customerEmail ? { 'customer_email': customerEmail } : {}),
      ...Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, String(v)])
      ),
    },
  });
}

export async function retrieveSession(secretKey, sessionId) {
  return stripeRequest(`/checkout/sessions/${sessionId}`, {
    method: 'GET',
    secretKey,
  });
}

export async function verifyWebhookSignature(body, signature, secret) {
  const parts = Object.fromEntries(
    signature.split(',').map(p => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const sig = parts.v1;
  if (!timestamp || !sig) return false;
  // Reject timestamps older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('');
  return expected === sig;
}
