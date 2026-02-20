export const prerender = false;
import { verifyWebhookSignature } from '../../../lib/stripe.js';
import { generateId } from '../../../lib/auth.js';
export async function POST({ request, locals }) {
  try {
    const env = locals.runtime?.env;
    const secret = env?.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return new Response('Webhook secret not configured', { status: 500 });
    }
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return new Response('Missing signature', { status: 400 });
    }
    const valid = await verifyWebhookSignature(body, signature, secret);
    if (!valid) {
      return new Response('Invalid signature', { status: 400 });
    }
    const event = JSON.parse(body);
    const db = env?.USERS_DB;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      // Record payment
      if (db) {
        const paymentId = generateId();
        await db.prepare(
          `INSERT INTO payments (id, user_id, type, stripe_session_id, stripe_payment_intent, amount_usd, status, job_id, document_title)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`
        ).bind(
          paymentId, meta.userId || null, meta.type || 'translation',
          session.id, session.payment_intent,
          (session.amount_total || 0) / 100, meta.jobId || null,
          meta.workTitle || null
        ).run();
        // If this is a translation payment, enqueue the first pipeline step
        if (meta.type === 'translation' && meta.jobId) {
          await db.prepare("UPDATE translation_jobs SET status = 'paid', stripe_payment_id = ? WHERE id = ?")
            .bind(session.payment_intent, meta.jobId).run();
          const queue = env?.TRANSLATION_QUEUE;
          if (queue) {
            await queue.send({ jobId: meta.jobId, step: 'segment_phrases' });
          }
        }
        // If this is a sponsorship contribution
        if (meta.type === 'sponsor' && meta.workId) {
          const sponsorship = await db.prepare(
            'SELECT * FROM sponsorships WHERE work_id = ?'
          ).bind(meta.workId).first();
          if (sponsorship) {
            const contribId = generateId();
            const amount = (session.amount_total || 0) / 100;
            await db.prepare(
              `INSERT INTO sponsor_contributions (id, sponsorship_id, payment_id, user_id, amount_usd)
               VALUES (?, ?, ?, ?, ?)`
            ).bind(contribId, sponsorship.id, paymentId, meta.userId || null, amount).run();
            // Update funded amount
            await db.prepare(
              'UPDATE sponsorships SET funded_usd = funded_usd + ? WHERE id = ?'
            ).bind(amount, sponsorship.id).run();
            // Check if fully funded
            const updated = await db.prepare('SELECT * FROM sponsorships WHERE id = ?').bind(sponsorship.id).first();
            if (updated && updated.funded_usd >= updated.estimated_cost_usd) {
              await db.prepare("UPDATE sponsorships SET status = 'funded' WHERE id = ?").bind(sponsorship.id).run();
            }
          }
        }
      }
    }
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[billing/webhook] Error:', err);
    return new Response('Webhook error', { status: 500 });
  }
}
