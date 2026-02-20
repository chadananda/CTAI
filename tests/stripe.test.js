import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from '../src/lib/stripe.js';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret_key';
  // Helper to sign a payload like Stripe does
  async function signPayload(body, timestamp, secret) {
    const payload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('');
  }

  it('accepts valid signature', async () => {
    const body = '{"type":"checkout.session.completed"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signPayload(body, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;
    const valid = await verifyWebhookSignature(body, header, secret);
    expect(valid).toBe(true);
  });

  it('rejects invalid signature', async () => {
    const body = '{"type":"checkout.session.completed"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=invalid_signature_hex`;
    const valid = await verifyWebhookSignature(body, header, secret);
    expect(valid).toBe(false);
  });

  it('rejects expired timestamp (older than 5 minutes)', async () => {
    const body = '{"type":"test"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = await signPayload(body, oldTimestamp, secret);
    const header = `t=${oldTimestamp},v1=${sig}`;
    const valid = await verifyWebhookSignature(body, header, secret);
    expect(valid).toBe(false);
  });

  it('rejects missing timestamp', async () => {
    const valid = await verifyWebhookSignature('body', 'v1=abc', secret);
    expect(valid).toBe(false);
  });

  it('rejects missing signature', async () => {
    const valid = await verifyWebhookSignature('body', 't=12345', secret);
    expect(valid).toBe(false);
  });

  it('rejects tampered body', async () => {
    const body = '{"type":"original"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signPayload(body, timestamp, secret);
    const header = `t=${timestamp},v1=${sig}`;
    const valid = await verifyWebhookSignature('{"type":"tampered"}', header, secret);
    expect(valid).toBe(false);
  });
});
