import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock D1 database
function createMockDb(data = {}) {
  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(data.first || null),
    all: vi.fn().mockResolvedValue({ results: data.all || [] }),
    run: vi.fn().mockResolvedValue({}),
  };
  return {
    prepare: vi.fn().mockReturnValue(mockStmt),
    _stmt: mockStmt,
  };
}

describe('POST /api/translate — Service Binding integration', () => {
  it('calls PIPELINE_WORKER.fetch instead of queue.send', async () => {
    // Import the module
    const mod = await import('../src/pages/api/translate/index.js');

    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const mockPipeline = { fetch: fetchSpy };
    const db = createMockDb();

    const request = new Request('https://ctai.info/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'بسم الله', lang: 'ar', style: 'literary' }),
    });

    const response = await mod.POST({
      request,
      locals: {
        user: { id: 'user123', email: 'test@test.com' },
        runtime: { env: { USERS_DB: db, PIPELINE_WORKER: mockPipeline } },
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.jobId).toBeDefined();

    // Verify service binding was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://pipeline/start');
    expect(opts.method).toBe('POST');
    const payload = JSON.parse(opts.body);
    expect(payload.jobId).toBe(body.jobId);
    expect(payload.lang).toBe('ar');
    expect(payload.userEmail).toBe('test@test.com');
  });

  it('rejects missing text', async () => {
    const mod = await import('../src/pages/api/translate/index.js');

    const response = await mod.POST({
      request: new Request('https://ctai.info/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: 'ar' }),
      }),
      locals: { user: { id: 'u1' }, runtime: { env: { USERS_DB: createMockDb() } } },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Source text');
  });

  it('rejects invalid language', async () => {
    const mod = await import('../src/pages/api/translate/index.js');

    const response = await mod.POST({
      request: new Request('https://ctai.info/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello', lang: 'en' }),
      }),
      locals: { user: { id: 'u1' }, runtime: { env: { USERS_DB: createMockDb() } } },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('ar or fa');
  });

  it('rejects unauthenticated requests', async () => {
    const mod = await import('../src/pages/api/translate/index.js');

    const response = await mod.POST({
      request: new Request('https://ctai.info/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test', lang: 'ar' }),
      }),
      locals: { user: null, runtime: { env: { USERS_DB: createMockDb() } } },
    });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/translate/[jobId] — block-level progress', () => {
  it('returns blocks array in response', async () => {
    const mod = await import('../src/pages/api/translate/[jobId].js');

    const job = {
      id: 'job-1', status: 'translating', style: 'literary', source_lang: 'ar',
      work_title: 'Test', estimated_cost_usd: 10, actual_cost_usd: 3.5,
      total_tokens: 5000, total_blocks: 3, blocks_done: 1, delib_round: 1,
      error_message: null, created_at: '2025-01-01', started_at: '2025-01-01', completed_at: null,
    };

    const blocks = [
      { id: 'b1', block_index: 0, status: 'complete', delib_round: 2, cost_usd: 1.5 },
      { id: 'b2', block_index: 1, status: 'translating', delib_round: 1, cost_usd: 1.0 },
      { id: 'b3', block_index: 2, status: 'pending', delib_round: 0, cost_usd: 0 },
    ];

    const phases = [
      { phase: 'segment_phrases', agent_role: null, round: 0, tokens_in: 100, tokens_out: 200, cost_usd: 0.01, created_at: '2025-01-01' },
    ];

    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes('FROM translation_jobs')) {
          return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(job) };
        }
        if (sql.includes('FROM job_phases')) {
          return { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: phases }) };
        }
        if (sql.includes('FROM job_blocks')) {
          return { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: blocks }) };
        }
        return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null), all: vi.fn().mockResolvedValue({ results: [] }) };
      }),
    };

    const response = await mod.GET({
      params: { jobId: 'job-1' },
      locals: {
        user: { id: 'user1', tier: 'admin' },
        runtime: { env: { USERS_DB: db } },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    // Job fields
    expect(body.job.totalBlocks).toBe(3);
    expect(body.job.blocksDone).toBe(1);
    expect(body.job.status).toBe('translating');

    // Blocks array
    expect(body.blocks).toHaveLength(3);
    expect(body.blocks[0]).toEqual({ id: 'b1', index: 0, status: 'complete', delibRound: 2, cost: 1.5 });
    expect(body.blocks[1]).toEqual({ id: 'b2', index: 1, status: 'translating', delibRound: 1, cost: 1.0 });
    expect(body.blocks[2]).toEqual({ id: 'b3', index: 2, status: 'pending', delibRound: 0, cost: 0 });

    // Phases still present
    expect(body.phases).toHaveLength(1);
  });

  it('returns 404 for unknown job', async () => {
    const mod = await import('../src/pages/api/translate/[jobId].js');
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };

    const response = await mod.GET({
      params: { jobId: 'nonexistent' },
      locals: { user: { id: 'u1' }, runtime: { env: { USERS_DB: db } } },
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 for non-owner non-admin', async () => {
    const mod = await import('../src/pages/api/translate/[jobId].js');
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'job-1', user_id: 'other-user' }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };

    const response = await mod.GET({
      params: { jobId: 'job-1' },
      locals: { user: { id: 'not-owner', tier: 'free' }, runtime: { env: { USERS_DB: db } } },
    });

    expect(response.status).toBe(403);
  });
});

describe('GET /api/email/unsubscribe', () => {
  it('updates email_digest to 0', async () => {
    const mod = await import('../src/pages/api/email/unsubscribe.js');
    const runSpy = vi.fn().mockResolvedValue({});
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        if (sql.includes('SELECT')) {
          return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ id: 'u1', email: 'test@test.com' }) };
        }
        return { bind: vi.fn().mockReturnThis(), run: runSpy };
      }),
    };

    const response = await mod.GET({
      url: new URL('https://ctai.info/api/email/unsubscribe?uid=u1&token=abc123'),
      locals: { runtime: { env: { USERS_DB: db } } },
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Unsubscribed');
    expect(runSpy).toHaveBeenCalled();
  });

  it('returns 400 for missing params', async () => {
    const mod = await import('../src/pages/api/email/unsubscribe.js');

    const response = await mod.GET({
      url: new URL('https://ctai.info/api/email/unsubscribe'),
      locals: { runtime: { env: { USERS_DB: {} } } },
    });

    expect(response.status).toBe(400);
  });

  it('returns 400 for unknown user', async () => {
    const mod = await import('../src/pages/api/email/unsubscribe.js');
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      }),
    };

    const response = await mod.GET({
      url: new URL('https://ctai.info/api/email/unsubscribe?uid=unknown&token=abc'),
      locals: { runtime: { env: { USERS_DB: db } } },
    });

    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Invalid');
  });
});
