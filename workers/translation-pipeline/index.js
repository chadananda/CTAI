// Translation Pipeline Queue Worker
// Consumes messages from TRANSLATION_QUEUE, executes pipeline steps,
// and enqueues the next step. State lives in D1 between steps.
export default {
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        const { jobId, step } = msg.body;
        console.log(`[pipeline] Processing job=${jobId} step=${step}`);
        const apiKey = env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
        const result = await executeStep({
          db: env.USERS_DB,
          jafarDb: env.JAFAR_DB,
          apiKey,
          jobId,
          step,
          bucket: env.TRANSLATIONS_BUCKET,
          queue: env.TRANSLATION_QUEUE,
        });
        if (result.nextStep) {
          await env.TRANSLATION_QUEUE.send({
            jobId,
            step: result.nextStep,
          });
          console.log(`[pipeline] Enqueued next step=${result.nextStep} for job=${jobId}`);
        } else {
          console.log(`[pipeline] Job ${jobId} complete`);
        }
        msg.ack();
      } catch (err) {
        console.error(`[pipeline] Error processing message:`, err);
        // Update job with error
        try {
          const { jobId } = msg.body;
          await env.USERS_DB.prepare(
            "UPDATE translation_jobs SET status = 'failed', error_message = ? WHERE id = ?"
          ).bind(err.message?.slice(0, 500) || 'Unknown error', jobId).run();
        } catch (dbErr) {
          console.error(`[pipeline] Failed to update job status:`, dbErr);
        }
        msg.retry();
      }
    }
  },
};
// Inline the step execution logic (Workers can't import from parent project)
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250929';
const PRICING = { input: 3.00, output: 15.00 }; // per million tokens
async function callAnthropic({ apiKey, system, messages, maxTokens = 4096, json = false }) {
  const systemPrompt = json
    ? `${system}\n\nYou MUST respond with valid JSON only. No commentary, no markdown fences.`
    : system;
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    const status = res.status;
    // Retry on 429 or 5xx
    if (status === 429 || status >= 500) {
      const err = new Error(`Anthropic API ${status}: ${errBody.slice(0, 200)}`);
      err.retryable = true;
      throw err;
    }
    throw new Error(`Anthropic API ${status}: ${errBody.slice(0, 200)}`);
  }
  const response = await res.json();
  const text = response.content[0].text;
  const usage = response.usage || {};
  const cost = ((usage.input_tokens || 0) * PRICING.input + (usage.output_tokens || 0) * PRICING.output) / 1_000_000;
  const result = { text, tokensIn: usage.input_tokens || 0, tokensOut: usage.output_tokens || 0, cost };
  if (json) {
    const cleaned = text.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '').trim();
    try {
      result.data = JSON.parse(cleaned);
    } catch {
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first !== -1 && last > first) {
        result.data = JSON.parse(cleaned.slice(first, last + 1));
      } else {
        throw new Error(`Failed to parse JSON: ${cleaned.slice(0, 200)}`);
      }
    }
  }
  return result;
}
function generateId(length = 21) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
const STEPS = [
  'segment_phrases', 'segment_sentences', 'segment_paras', 'segment_join',
  'research', 'render_round', 'critique_round', 'converge', 'assemble', 'review',
];
const STATUS_MAP = {
  segment_phrases: 'segmenting', segment_sentences: 'segmenting',
  segment_paras: 'segmenting', segment_join: 'segmenting',
  research: 'researching', render_round: 'translating',
  critique_round: 'deliberating', converge: 'assembling',
  assemble: 'assembling', review: 'reviewing',
};
async function executeStep({ db, apiKey, jobId, step, jafarDb, bucket, queue }) {
  const jobStatus = STATUS_MAP[step] || 'translating';
  await db.prepare("UPDATE translation_jobs SET status = ?, started_at = COALESCE(started_at, datetime('now')) WHERE id = ?")
    .bind(jobStatus, jobId).run();
  const job = await db.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!job) throw new Error(`Job ${jobId} not found`);
  const phases = await db.prepare('SELECT phase, output_json FROM job_phases WHERE job_id = ? ORDER BY created_at')
    .bind(jobId).all();
  // Build outputs map — for phases that can repeat (render_round, critique_round), keep the latest
  const prevOutputs = {};
  for (const p of phases.results) {
    prevOutputs[p.phase] = p.output_json ? JSON.parse(p.output_json) : null;
  }
  let result, nextStep;
  if (step.startsWith('segment_')) {
    const segPrompts = {
      segment_phrases: `Identify clause boundaries in this ${job.source_lang === 'ar' ? 'Arabic' : 'Persian'} text. Break it into individual phrases (clause-level units). Return JSON: { "phrases": ["phrase1", "phrase2", ...] }`,
      segment_sentences: `Group these phrases into complete sentences (semantic statements). Return JSON: { "sentences": [{ "phrases": ["p1","p2"], "text": "full sentence" }, ...] }`,
      segment_paras: `Group these sentences into thematic paragraphs. Return JSON: { "paragraphs": [{ "sentence_indices": [0,1,2], "theme": "brief description" }, ...] }`,
      segment_join: `Validate paragraph boundaries and produce the final segmented structure. Return JSON: { "paragraphs": [{ "text": "full paragraph", "sentences": [{ "text": "sentence", "phrases": ["p1","p2"] }] }] }`,
    };
    const input = step === 'segment_phrases'
      ? job.source_text
      : JSON.stringify(prevOutputs[STEPS[STEPS.indexOf(step) - 1]]);
    const res = await callAnthropic({
      apiKey,
      system: `You are an expert in ${job.source_lang === 'ar' ? 'Arabic' : 'Persian'} text segmentation.`,
      messages: [{ role: 'user', content: `${segPrompts[step]}\n\nInput:\n${input}` }],
      json: true,
    });
    const nextIdx = STEPS.indexOf(step) + 1;
    nextStep = STEPS[nextIdx];
    result = { input: { step }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost };
  } else if (step === 'research') {
    const segmented = prevOutputs.segment_join;
    const res = await callAnthropic({
      apiKey,
      system: 'You are a research assistant preparing concordance reference packets for a translation committee.',
      messages: [{ role: 'user', content: `Analyze key terms in this segmented text and prepare a reference packet.\n\n${JSON.stringify(segmented)}\n\nReturn JSON: { "terms": [{ "term": "...", "transliteration": "...", "recommended_rendering": "..." }], "reference_packet": "formatted summary" }` }],
      json: true,
    });
    nextStep = 'render_round';
    result = { input: { step }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'research' };
  } else if (step === 'render_round') {
    const roles = ['literary', 'persian', 'theological'];
    const renderings = [];
    let totalIn = 0, totalOut = 0, totalCost = 0;
    for (const role of roles) {
      const res = await callAnthropic({
        apiKey,
        system: `You are the ${role} translator on a committee translating ${job.source_lang === 'ar' ? 'Arabic' : 'Persian'} sacred texts.`,
        messages: [{ role: 'user', content: `Render this text. Reference packet: ${JSON.stringify(prevOutputs.research)}\nSegmented text: ${JSON.stringify(prevOutputs.segment_join)}\n\nReturn JSON: { "rendering": [{ "source": "...", "translation": "..." }] }` }],
        json: true,
      });
      renderings.push({ role, data: res.data });
      totalIn += res.tokensIn; totalOut += res.tokensOut; totalCost += res.cost;
    }
    nextStep = 'critique_round';
    result = { input: { round: job.delib_round + 1 }, output: { renderings }, tokensIn: totalIn, tokensOut: totalOut, cost: totalCost, agentRole: 'render' };
    await db.prepare('UPDATE translation_jobs SET delib_round = delib_round + 1 WHERE id = ?').bind(jobId).run();
  } else if (step === 'critique_round') {
    const renderings = prevOutputs.render_round?.renderings || [];
    const critiques = [];
    let totalIn = 0, totalOut = 0, totalCost = 0;
    for (const rendering of renderings) {
      const others = renderings.filter(r => r.role !== rendering.role);
      const res = await callAnthropic({
        apiKey,
        system: `You are the ${rendering.role} translator. Critique the other renderings.`,
        messages: [{ role: 'user', content: `Your rendering: ${JSON.stringify(rendering.data)}\nOthers: ${JSON.stringify(others)}\n\nReturn JSON: { "agreements": [...], "disagreements": [...], "suggestions": [...] }` }],
        json: true,
      });
      critiques.push({ role: rendering.role, data: res.data });
      totalIn += res.tokensIn; totalOut += res.tokensOut; totalCost += res.cost;
    }
    const hasDisagreements = critiques.some(c => c.data?.disagreements?.length > 0);
    const round = job.delib_round;
    nextStep = (hasDisagreements && round < 3) ? 'render_round' : 'converge';
    result = { input: { round }, output: { critiques, converged: !hasDisagreements }, tokensIn: totalIn, tokensOut: totalOut, cost: totalCost, agentRole: 'critique' };
  } else if (step === 'converge') {
    const res = await callAnthropic({
      apiKey,
      system: 'Synthesize a final phrase-by-phrase rendering from committee deliberation.',
      messages: [{ role: 'user', content: `Renderings: ${JSON.stringify(prevOutputs.render_round)}\nCritiques: ${JSON.stringify(prevOutputs.critique_round)}\n\nReturn JSON: { "final_rendering": [{ "source": "...", "translation": "...", "notes": "..." }] }` }],
      json: true,
    });
    nextStep = 'assemble';
    result = { input: {}, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'convergence' };
  } else if (step === 'assemble') {
    const res = await callAnthropic({
      apiKey,
      system: 'Compose phrase-level renderings into flowing English paragraphs.',
      messages: [{ role: 'user', content: `Converged rendering: ${JSON.stringify(prevOutputs.converge)}\n\nReturn JSON: { "paragraphs": [{ "source": "...", "translation": "...", "phrases": [{ "source": "...", "translation": "..." }] }] }` }],
      json: true,
    });
    nextStep = 'review';
    result = { input: {}, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'assembly' };
  } else if (step === 'review') {
    const res = await callAnthropic({
      apiKey,
      system: 'Review this translation for fidelity to the source text.',
      messages: [{ role: 'user', content: `Source: ${job.source_text}\nTranslation: ${JSON.stringify(prevOutputs.assemble)}\n\nReturn JSON: { "approved": true/false, "issues": [...], "final_output": { "paragraphs": [...] } }` }],
      json: true,
    });
    nextStep = null;
    result = { input: {}, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'fidelity' };
  }
  // Record phase
  const phaseId = generateId();
  await db.prepare(
    `INSERT INTO job_phases (id, job_id, phase, agent_role, round, input_json, output_json, tokens_in, tokens_out, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(phaseId, jobId, step, result.agentRole || null, job.delib_round, JSON.stringify(result.input), JSON.stringify(result.output), result.tokensIn, result.tokensOut, result.cost).run();
  // Update job cost tracking
  await db.prepare('UPDATE translation_jobs SET actual_cost_usd = actual_cost_usd + ?, total_tokens = total_tokens + ? WHERE id = ?')
    .bind(result.cost, result.tokensIn + result.tokensOut, jobId).run();
  if (!nextStep) {
    await db.prepare("UPDATE translation_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?").bind(jobId).run();
  }
  return { nextStep, jobId };
}
