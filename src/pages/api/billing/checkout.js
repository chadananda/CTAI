export const prerender = false;
import { createCheckoutSession } from '../../../lib/stripe.js';
export async function POST({ request, locals }) {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    const env = locals.runtime?.env;
    const secretKey = env?.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const { type, amount, jobId, description, workId, workTitle } = await request.json();
    if (!amount || amount < 1) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const origin = new URL(request.url).origin;
    const session = await createCheckoutSession({
      secretKey,
      priceUsd: amount,
      customerEmail: user.email,
      successUrl: `${origin}/billing?success=true`,
      cancelUrl: `${origin}/billing?canceled=true`,
      metadata: {
        type: type || 'translation',
        userId: user.id,
        jobId: jobId || '',
        workId: workId || '',
        workTitle: workTitle || '',
        description: description || 'CTAI Translation',
      },
    });
    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[billing/checkout] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
