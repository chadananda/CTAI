// Translation pipeline step machine
// Each step: read state from D1 → call AI → write results to D1 → return next step
import { callAnthropic } from './provider.js';
import { generateId } from '../auth.js';
// Pipeline step definitions — order matters
const STEPS = [
  'segment_phrases',
  'segment_sentences',
  'segment_paras',
  'segment_join',
  'research',
  'render_round',      // 3 translators render independently
  'critique_round',    // 3 translators critique each other
  'converge',
  'assemble',
  'review',
];
const STATUS_MAP = {
  segment_phrases: 'segmenting',
  segment_sentences: 'segmenting',
  segment_paras: 'segmenting',
  segment_join: 'segmenting',
  research: 'researching',
  render_round: 'translating',
  critique_round: 'deliberating',
  converge: 'assembling',
  assemble: 'assembling',
  review: 'reviewing',
};
export async function executeStep({ db, apiKey, jobId, step, jafarDb }) {
  // Update job status
  const jobStatus = STATUS_MAP[step] || 'translating';
  await db.prepare('UPDATE translation_jobs SET status = ?, started_at = COALESCE(started_at, datetime(\'now\')) WHERE id = ?')
    .bind(jobStatus, jobId).run();
  // Load job
  const job = await db.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!job) throw new Error(`Job ${jobId} not found`);
  // Load previous phase outputs
  const phases = await db.prepare('SELECT * FROM job_phases WHERE job_id = ? ORDER BY created_at')
    .bind(jobId).all();
  const prevOutputs = phases.results.reduce((acc, p) => {
    acc[p.phase] = p.output_json ? JSON.parse(p.output_json) : null;
    return acc;
  }, {});
  let result;
  let nextStep;
  switch (step) {
    case 'segment_phrases':
    case 'segment_sentences':
    case 'segment_paras':
    case 'segment_join':
      ({ result, nextStep } = await runSegmentationStep({ apiKey, job, step, prevOutputs }));
      break;
    case 'research':
      ({ result, nextStep } = await runResearchStep({ apiKey, job, prevOutputs, jafarDb }));
      break;
    case 'render_round':
      ({ result, nextStep } = await runRenderRound({ apiKey, job, prevOutputs }));
      break;
    case 'critique_round':
      ({ result, nextStep } = await runCritiqueRound({ apiKey, job, prevOutputs }));
      break;
    case 'converge':
      ({ result, nextStep } = await runConverge({ apiKey, job, prevOutputs }));
      break;
    case 'assemble':
      ({ result, nextStep } = await runAssemble({ apiKey, job, prevOutputs }));
      break;
    case 'review':
      ({ result, nextStep } = await runReview({ apiKey, job, prevOutputs }));
      break;
    default:
      throw new Error(`Unknown step: ${step}`);
  }
  // Record phase
  const phaseId = generateId();
  await db.prepare(
    `INSERT INTO job_phases (id, job_id, phase, agent_role, round, input_json, output_json, tokens_in, tokens_out, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    phaseId, jobId, step, result.agentRole || null, job.delib_round,
    JSON.stringify(result.input), JSON.stringify(result.output),
    result.tokensIn || 0, result.tokensOut || 0, result.cost || 0
  ).run();
  // Update job cost tracking
  await db.prepare(
    'UPDATE translation_jobs SET actual_cost_usd = actual_cost_usd + ?, total_tokens = total_tokens + ? WHERE id = ?'
  ).bind(result.cost || 0, (result.tokensIn || 0) + (result.tokensOut || 0), jobId).run();
  // If no next step, mark complete
  if (!nextStep) {
    await db.prepare(
      "UPDATE translation_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?"
    ).bind(jobId).run();
  }
  return { nextStep, jobId };
}
// --- Step implementations (stubs — will be expanded with real prompts) ---
async function runSegmentationStep({ apiKey, job, step, prevOutputs }) {
  const stepPrompts = {
    segment_phrases: 'Identify clause boundaries, prepositional phrases, and verbal constructions in this text. Return JSON: { "phrases": ["phrase1", "phrase2", ...] }',
    segment_sentences: 'Group these phrases into complete semantic statements. Return JSON: { "sentences": [["phrase1", "phrase2"], ...] }',
    segment_paras: 'Group these sentences into thematic paragraph units. Return JSON: { "paragraphs": [[sentence_indices...], ...] }',
    segment_join: 'Validate and correct paragraph boundaries. Return the final segmented structure. Return JSON: { "paragraphs": [{ "sentences": [{ "phrases": ["..."] }] }] }',
  };
  const input = step === 'segment_phrases'
    ? { text: job.source_text, lang: job.source_lang }
    : { prevStep: step, prevOutput: prevOutputs[STEPS[STEPS.indexOf(step) - 1]] };
  const res = await callAnthropic({
    apiKey,
    system: `You are a text segmentation expert for ${job.source_lang === 'ar' ? 'Arabic' : 'Persian'} texts.`,
    messages: [{ role: 'user', content: `${stepPrompts[step]}\n\nText: ${JSON.stringify(input)}` }],
    json: true,
  });
  const nextStepIdx = STEPS.indexOf(step) + 1;
  const nextStep = nextStepIdx < STEPS.length ? STEPS[nextStepIdx] : null;
  return {
    result: { input, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost },
    nextStep,
  };
}
async function runResearchStep({ apiKey, job, prevOutputs, jafarDb }) {
  // Look up terms in Jafar concordance, build reference packet
  const segmented = prevOutputs.segment_join;
  const input = { segmented, lang: job.source_lang };
  const res = await callAnthropic({
    apiKey,
    system: 'You are a research assistant preparing a concordance reference packet for translators.',
    messages: [{ role: 'user', content: `Analyze the key terms in this segmented ${job.source_lang === 'ar' ? 'Arabic' : 'Persian'} text and identify which terms need concordance lookup. Return JSON: { "terms": [{ "term": "...", "context": "..." }], "reference_packet": "..." }\n\nSegmented text: ${JSON.stringify(segmented)}` }],
    json: true,
  });
  return {
    result: { input, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'research' },
    nextStep: 'render_round',
  };
}
async function runRenderRound({ apiKey, job, prevOutputs }) {
  const translators = ['literary', 'persian', 'theological'];
  const results = [];
  for (const role of translators) {
    const res = await callAnthropic({
      apiKey,
      system: `You are the ${role} translator on a committee translating ${job.source_lang === 'ar' ? 'Arabic' : 'Persian'} sacred texts into English.`,
      messages: [{ role: 'user', content: `Render this text into English with your ${role} perspective. Use the reference packet for guidance on established renderings.\n\nText: ${JSON.stringify(prevOutputs.segment_join)}\nReference: ${JSON.stringify(prevOutputs.research)}\n\nReturn JSON: { "rendering": [{ "source": "...", "translation": "..." }] }` }],
      json: true,
    });
    results.push({ role, ...res });
  }
  const totalTokensIn = results.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = results.reduce((s, r) => s + r.tokensOut, 0);
  const totalCost = results.reduce((s, r) => s + r.cost, 0);
  return {
    result: {
      input: { round: job.delib_round + 1 },
      output: { renderings: results.map(r => ({ role: r.role, data: r.data })) },
      tokensIn: totalTokensIn, tokensOut: totalTokensOut, cost: totalCost,
      agentRole: 'render',
    },
    nextStep: 'critique_round',
  };
}
async function runCritiqueRound({ apiKey, job, prevOutputs }) {
  const renderings = prevOutputs.render_round?.renderings || [];
  const critiques = [];
  for (const rendering of renderings) {
    const others = renderings.filter(r => r.role !== rendering.role);
    const res = await callAnthropic({
      apiKey,
      system: `You are the ${rendering.role} translator. Critique the other translators' renderings.`,
      messages: [{ role: 'user', content: `Compare your rendering with these other two and identify agreements, disagreements, and suggested improvements.\n\nYour rendering: ${JSON.stringify(rendering.data)}\nOther renderings: ${JSON.stringify(others.map(o => ({ role: o.role, data: o.data })))}\n\nReturn JSON: { "agreements": [...], "disagreements": [...], "suggestions": [...] }` }],
      json: true,
    });
    critiques.push({ role: rendering.role, ...res });
  }
  const totalTokensIn = critiques.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = critiques.reduce((s, r) => s + r.tokensOut, 0);
  const totalCost = critiques.reduce((s, r) => s + r.cost, 0);
  // Check if we need another round (max 3)
  const round = job.delib_round + 1;
  const hasDisagreements = critiques.some(c => c.data?.disagreements?.length > 0);
  const needsAnotherRound = hasDisagreements && round < 3;
  // Update deliberation round
  await Promise.resolve(); // DB update happens in executeStep
  return {
    result: {
      input: { round },
      output: { critiques: critiques.map(c => ({ role: c.role, data: c.data })), round, converged: !hasDisagreements },
      tokensIn: totalTokensIn, tokensOut: totalTokensOut, cost: totalCost,
      agentRole: 'critique',
    },
    nextStep: needsAnotherRound ? 'render_round' : 'converge',
  };
}
async function runConverge({ apiKey, job, prevOutputs }) {
  const res = await callAnthropic({
    apiKey,
    system: 'You are the convergence synthesizer. Produce a final phrase-by-phrase rendering from committee deliberation.',
    messages: [{ role: 'user', content: `Synthesize the final translation from these committee deliberation results.\n\nRenderings: ${JSON.stringify(prevOutputs.render_round)}\nCritiques: ${JSON.stringify(prevOutputs.critique_round)}\n\nReturn JSON: { "final_rendering": [{ "source": "...", "translation": "...", "notes": "..." }] }` }],
    json: true,
  });
  return {
    result: { input: {}, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'convergence' },
    nextStep: 'assemble',
  };
}
async function runAssemble({ apiKey, job, prevOutputs }) {
  const res = await callAnthropic({
    apiKey,
    system: 'You are the assembly agent. Compose phrase-level renderings into flowing English paragraphs.',
    messages: [{ role: 'user', content: `Compose these phrase-by-phrase renderings into flowing, literary English paragraphs.\n\nConverged rendering: ${JSON.stringify(prevOutputs.converge)}\n\nReturn JSON: { "paragraphs": [{ "source": "...", "translation": "...", "phrases": [{ "source": "...", "translation": "..." }] }] }` }],
    json: true,
  });
  return {
    result: { input: {}, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'assembly' },
    nextStep: 'review',
  };
}
async function runReview({ apiKey, job, prevOutputs }) {
  const res = await callAnthropic({
    apiKey,
    system: 'You are the fidelity reviewer. Check the final translation for drift from the source text.',
    messages: [{ role: 'user', content: `Review this translation for fidelity to the source. Flag any drift, missed nuances, or inaccuracies.\n\nSource: ${job.source_text}\nTranslation: ${JSON.stringify(prevOutputs.assemble)}\n\nReturn JSON: { "approved": true/false, "issues": [...], "final_output": { "paragraphs": [...] } }` }],
    json: true,
  });
  return {
    result: { input: {}, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost, agentRole: 'fidelity' },
    nextStep: null, // Pipeline complete
  };
}
export { STEPS, STATUS_MAP };
