import { describe, it, expect, vi } from 'vitest';
import { onRequest } from '../src/middleware.js';

describe('middleware — public API paths', () => {
  function makeContext(path, method = 'GET') {
    return {
      request: new Request(`https://ctai.info${path}`, { method }),
      locals: { runtime: { env: { USERS_DB: {}, SESSIONS: {} } } },
      url: new URL(`https://ctai.info${path}`),
    };
  }

  it('allows GET /api/email/unsubscribe without auth', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const ctx = makeContext('/api/email/unsubscribe?uid=u1&token=abc');

    const response = await onRequest(ctx, next);

    // Should call next() (pass through), not return 401
    expect(next).toHaveBeenCalled();
  });

  it('allows GET /api/auth/ without auth', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const ctx = makeContext('/api/auth/login');

    await onRequest(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows GET /api/translations/ without auth', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const ctx = makeContext('/api/translations/some-id');

    await onRequest(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks POST /api/translate without auth', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const ctx = makeContext('/api/translate', 'POST');

    const response = await onRequest(ctx, next);

    expect(response.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks POST /api/email/unsubscribe without auth', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const ctx = makeContext('/api/email/unsubscribe', 'POST');

    const response = await onRequest(ctx, next);

    // POST to unsubscribe is NOT in the public paths (only GET is)
    expect(response.status).toBe(401);
  });
});
