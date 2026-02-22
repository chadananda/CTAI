// Translation Pipeline Worker — Cloudflare Workflows
// 3 Workflow classes: SegmentWorkflow → BlockWorkflow(s) → FinalizeWorkflow
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { completionEmailHtml, digestEmailHtml } from './email-templates.js';
import {
  generateId, wordCount, splitIntoBlocks, jsonResponse, parseAIJson, calculateCost,
  ANTHROPIC_API, MODEL, PRICING, RESEND_API, MAX_BLOCK_WORDS, MAX_DELIB_ROUNDS,
} from './utils.js';

// --- Anthropic API wrapper ---

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
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    const err = new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 200)}`);
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  const response = await res.json();
  const text = response.content[0].text;
  const usage = response.usage || {};
  const cost = calculateCost(usage.input_tokens, usage.output_tokens);
  const result = { text, tokensIn: usage.input_tokens || 0, tokensOut: usage.output_tokens || 0, cost };
  if (json) {
    result.data = parseAIJson(text);
  }
  return result;
}

async function trackedCallAnthropic({ db, jobId, phase, agentRole, ...anthropicParams }) {
  const start = Date.now();
  const res = await callAnthropic(anthropicParams);
  const duration = Date.now() - start;
  const promptChars = JSON.stringify(anthropicParams.messages).length;
  try {
    await db.prepare(
      `INSERT INTO api_call_log (id, job_id, phase, agent_role, model, prompt_chars, response_chars, tokens_in, tokens_out, cost_usd, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), jobId, phase, agentRole || null, MODEL,
      promptChars, res.text.length, res.tokensIn, res.tokensOut, res.cost, duration).run();
  } catch (e) {
    console.error('[trackedCallAnthropic] Failed to log call:', e.message);
  }
  return res;
}

async function recordPhase(db, { jobId, phase, agentRole, round, input, output, tokensIn, tokensOut, cost }) {
  const phaseId = generateId();
  await db.prepare(
    `INSERT INTO job_phases (id, job_id, phase, agent_role, round, input_json, output_json, tokens_in, tokens_out, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(phaseId, jobId, phase, agentRole || null, round || 0,
    JSON.stringify(input || {}), JSON.stringify(output || {}),
    tokensIn || 0, tokensOut || 0, cost || 0).run();
  await db.prepare(
    'UPDATE translation_jobs SET actual_cost_usd = actual_cost_usd + ?, total_tokens = total_tokens + ? WHERE id = ?'
  ).bind(cost || 0, (tokensIn || 0) + (tokensOut || 0), jobId).run();
}

async function sendEmail({ apiKey, to, subject, html }) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ from: 'CTAI <noreply@ctai.info>', to: [to], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// --- SegmentWorkflow ---
// Segments source text into phrases → sentences → paragraphs → blocks
// Then spawns N BlockWorkflow instances in parallel

export class SegmentWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId } = event.payload;
    const db = this.env.USERS_DB;
    const apiKey = this.env.ANTHROPIC_API_KEY;

    const job = await step.do('load-job', async () => {
      const j = await db.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first();
      if (!j) throw new Error(`Job ${jobId} not found`);
      await db.prepare("UPDATE translation_jobs SET status = 'segmenting', started_at = COALESCE(started_at, datetime('now')) WHERE id = ?")
        .bind(jobId).run();
      return { sourceText: j.source_text, sourceLang: j.source_lang, style: j.style };
    });

    const langName = job.sourceLang === 'ar' ? 'Arabic' : 'Persian';
    const langCode = job.sourceLang;

    const PHRASE_SYSTEM = langCode === 'ar'
      ? `You are an expert segmenter of classical Arabic texts (Bahá'í sacred writings, Qur'anic, and literary Arabic).

Your task: break the input text into clause-level phrases. These texts have NO punctuation and NO paragraph breaks — you must rely entirely on grammatical and semantic cues.

For Arabic, identify clause boundaries using:
- Verbal constructions: فعل + فاعل + مفعول sequences
- Prepositional phrases: في، على، من، إلى، عن، ب، ل، ك
- Conjunctions that open new clauses: و (wa), ف (fa), ثم (thumma), أو (aw)
- Vocatives: يا، أيها، أيتها (these always start a new phrase)
- Conditional/temporal markers: إذا، لو، إن، لمّا، حين
- Demonstratives introducing new referents

Poetry/verse detection:
- If the text contains poetic couplets (بيت) or hemistichs (مصراع), flag them with "verse": true
- Preserve hemistich structure — mark first hemistich as "hemistich": 1, second as "hemistich": 2
- The * character in some texts acts as a phrase/clause delimiter — use it as a strong boundary hint

Keep each phrase as a minimal complete grammatical unit. Do not split mid-construct (e.g., do not split an iḍāfa chain or a verb from its direct object).`
      : `You are an expert segmenter of classical Persian texts (Bahá'í sacred writings, Sufi poetry, and literary Persian).

Your task: break the input text into clause-level phrases. These texts have NO punctuation and NO paragraph breaks — you must rely entirely on grammatical and semantic cues.

For Persian, identify clause boundaries using:
- SOV verb position: the verb at the end of a clause marks its boundary
- Ezafe constructions: -e/-ye connecting nouns/adjectives — keep these together as one phrase
- Postpositions and prepositions: از، به، در، با، بر، برای، تا
- Conjunctions: و (va), که (ke), تا (tā), اگر (agar), چون (chun), زيرا (zīrā)
- Relative clauses introduced by که
- Verb prefixes: می (mi-), ب (be-), ن (na-) marking new verbal phrases

Poetry/verse detection:
- If the text contains poetic couplets (بيت) or hemistichs (مصراع), flag them with "verse": true
- Preserve hemistich structure — mark first hemistich as "hemistich": 1, second as "hemistich": 2
- The * character in some texts acts as a phrase/clause delimiter — use it as a strong boundary hint

Keep each phrase as a minimal complete grammatical unit. Do not split mid-construct (e.g., do not split an ezafe chain or a verb from its preverbal elements).`;

    // Step 1: Segment into phrases
    const phrases = await step.do('segment-phrases', async () => {
      const res = await trackedCallAnthropic({
        db, jobId, phase: 'segment_phrases', agentRole: 'segmenter',
        apiKey,
        system: PHRASE_SYSTEM,
        messages: [{ role: 'user', content: `Segment this ${langName} text into clause-level phrases.

Return JSON: { "phrases": [{ "text": "...", "verse": false, "hemistich": null }, ...] }

Where:
- "text": the phrase text exactly as it appears (preserve all original characters)
- "verse": true if this phrase is part of a poetic couplet/verse, false otherwise
- "hemistich": null for prose, 1 for first hemistich, 2 for second hemistich

Text:
${job.sourceText}` }],
        json: true,
      });
      await recordPhase(db, { jobId, phase: 'segment_phrases', input: { step: 'segment_phrases' }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      return res.data;
    });

    // Step 2: Group into sentences
    const sentences = await step.do('segment-sentences', async () => {
      const res = await trackedCallAnthropic({
        db, jobId, phase: 'segment_sentences', agentRole: 'segmenter',
        apiKey,
        system: `You are an expert in ${langName} text segmentation, specializing in grouping phrases into complete semantic statements.

Rules for grouping:
- A "sentence" is a complete semantic statement — a thought that can stand alone
- For prose: group phrases that form a single proposition or command
- For verse: a couplet (two hemistichs) = one sentence with type "verse_couplet"
- A single verse line (one hemistich standing alone) = type "verse_line"
- Prose statements = type "prose"
- Preserve the order and exact text of all phrases — do not modify, merge, or drop any phrase`,
        messages: [{ role: 'user', content: `Group these phrases into complete sentences.

Return JSON: { "sentences": [{ "phrases": [{ "text": "...", "verse": false, "hemistich": null }], "text": "full sentence text", "type": "prose" | "verse_couplet" | "verse_line" }, ...] }

Phrases:
${JSON.stringify(phrases.phrases || phrases)}` }],
        json: true,
      });
      await recordPhase(db, { jobId, phase: 'segment_sentences', input: { step: 'segment_sentences' }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      return res.data;
    });

    // Step 3: Group into paragraphs
    const paras = await step.do('segment-paragraphs', async () => {
      const res = await trackedCallAnthropic({
        db, jobId, phase: 'segment_paras', agentRole: 'segmenter',
        apiKey,
        system: `You are an expert in ${langName} text segmentation, specializing in identifying thematic paragraph boundaries.

Rules for paragraph grouping:
- For prose: detect thematic shifts — new topic, new addressee, shift from exhortation to narrative, shift from abstract to concrete, new logical argument
- For verse: a stanza or thematic verse group = one paragraph with type "verse_stanza"
- Mixed prose and verse in one thematic unit = type "mixed"
- Pure prose paragraphs = type "prose"
- Provide a brief theme description for each paragraph (in English)
- Use sentence_indices (0-based) referencing the sentences array`,
        messages: [{ role: 'user', content: `Group these sentences into thematic paragraphs.

Return JSON: { "paragraphs": [{ "sentence_indices": [0, 1, 2], "theme": "brief thematic description", "type": "prose" | "verse_stanza" | "mixed" }, ...] }

Sentences:
${JSON.stringify(sentences.sentences || sentences)}` }],
        json: true,
      });
      await recordPhase(db, { jobId, phase: 'segment_paras', input: { step: 'segment_paras' }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      return res.data;
    });

    // Step 4: Validate and produce final nested structure
    const sentencesList = sentences.sentences || sentences;
    const parasList = paras.paragraphs || paras;
    const segmented = await step.do('segment-join', async () => {
      const res = await trackedCallAnthropic({
        db, jobId, phase: 'segment_join', agentRole: 'segmenter',
        apiKey,
        system: `You are a validation specialist for ${langName} text segmentation. Your job is to verify and produce the final nested structure.

Validation rules:
- Every phrase from the original text must appear exactly once — no dropped or duplicated text
- Sentence indices in paragraph groupings must cover all sentences with no gaps or overlaps
- Preserve all verse/hemistich metadata from earlier passes
- The concatenation of all phrase texts should reconstruct the original source text (allowing whitespace differences)
- If you detect errors (missing text, duplicated phrases, invalid indices), fix them in the output`,
        messages: [{ role: 'user', content: `Validate the segmentation and produce the final nested structure.

Return JSON: { "paragraphs": [{ "text": "full paragraph text", "type": "prose" | "verse_stanza" | "mixed", "theme": "...", "sentences": [{ "text": "full sentence text", "type": "prose" | "verse_couplet" | "verse_line", "phrases": [{ "text": "phrase text", "verse": false, "hemistich": null }] }] }] }

Sentences:
${JSON.stringify(sentencesList)}

Paragraph groupings:
${JSON.stringify(parasList)}` }],
        json: true,
      });
      await recordPhase(db, { jobId, phase: 'segment_join', input: { step: 'segment_join' }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      return res.data;
    });

    // Step 5: Split paragraphs into blocks of ≤ MAX_BLOCK_WORDS words
    const blockIds = await step.do('split-blocks', async () => {
      const paragraphs = segmented.paragraphs || [];
      let blocks = splitIntoBlocks(paragraphs, MAX_BLOCK_WORDS);
      // Ensure at least 1 block
      if (blocks.length === 0) blocks = [{ texts: [job.sourceText], paraIndices: [0] }];

      const ids = [];
      for (let i = 0; i < blocks.length; i++) {
        const blockId = generateId();
        await db.prepare(
          `INSERT INTO job_blocks (id, job_id, block_index, source_text, paragraph_indices, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`
        ).bind(blockId, jobId, i, blocks[i].texts.join('\n\n'), JSON.stringify(blocks[i].paraIndices)).run();
        ids.push(blockId);
      }

      await db.prepare('UPDATE translation_jobs SET total_blocks = ?, status = ? WHERE id = ?')
        .bind(blocks.length, 'researching', jobId).run();

      return ids;
    });

    // Step 6: Spawn parallel BlockWorkflows
    await step.do('spawn-blocks', async () => {
      for (const blockId of blockIds) {
        const instance = await this.env.BLOCK_WORKFLOW.create({
          params: { jobId, blockId },
        });
        await db.prepare('UPDATE job_blocks SET workflow_id = ? WHERE id = ?')
          .bind(instance.id, blockId).run();
      }
    });
  }
}

// --- BlockWorkflow ---
// Processes a single block: research → render (3 parallel) → critique → loop → converge
// Last block to complete triggers FinalizeWorkflow

export class BlockWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, blockId } = event.payload;
    const db = this.env.USERS_DB;
    const jafarDb = this.env.JAFAR_DB;
    const apiKey = this.env.ANTHROPIC_API_KEY;

    const block = await step.do('load-block', async () => {
      const b = await db.prepare('SELECT * FROM job_blocks WHERE id = ?').bind(blockId).first();
      if (!b) throw new Error(`Block ${blockId} not found`);
      const job = await db.prepare('SELECT source_lang, style FROM translation_jobs WHERE id = ?').bind(jobId).first();
      return { sourceText: b.source_text, blockIndex: b.block_index, sourceLang: job.source_lang, style: job.style };
    });

    const langName = block.sourceLang === 'ar' ? 'Arabic' : 'Persian';

    // Research step
    const research = await step.do('research', async () => {
      await db.prepare("UPDATE job_blocks SET status = 'researching' WHERE id = ?").bind(blockId).run();

      // Look up terms in Jafar concordance
      let concordanceContext = '';
      try {
        // Extract key terms from the block for concordance lookup
        const terms = block.sourceText.split(/\s+/).filter(t => t.length > 2).slice(0, 20);
        const placeholders = terms.map(() => '?').join(',');
        if (terms.length > 0) {
          const rows = await jafarDb.prepare(
            `SELECT term, transliteration, rendering, source_work, context FROM concordance WHERE term IN (${placeholders}) LIMIT 50`
          ).bind(...terms).all();
          if (rows.results.length > 0) {
            concordanceContext = '\n\nJafar Concordance Entries:\n' + rows.results.map(r =>
              `- ${r.term} (${r.transliteration}): "${r.rendering}" — ${r.source_work}`
            ).join('\n');
          }
        }
      } catch { /* concordance lookup is best-effort */ }

      const res = await trackedCallAnthropic({
        db, jobId, phase: 'research', agentRole: 'research',
        apiKey,
        system: `You are the Research Agent for the CTAI Committee Translation system. Your role is to prepare a comprehensive Reference Packet for the translation committee.\n\nGiven a segmented ${langName} source text, identify key terms that carry theological, mystical, or technical meaning. Build a reference packet with concordance precedents.`,
        messages: [{ role: 'user', content: `Analyze key terms in this ${langName} text and prepare a reference packet.\n${concordanceContext}\n\nText:\n${block.sourceText}\n\nReturn JSON: { "terms": [{ "term": "...", "transliteration": "...", "recommended_rendering": "...", "notes": "..." }], "reference_packet": "formatted summary for translators" }` }],
        json: true,
      });

      await recordPhase(db, { jobId, phase: 'research', agentRole: 'research', input: { blockId, blockIndex: block.blockIndex }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      await db.prepare('UPDATE job_blocks SET tokens_used = tokens_used + ?, cost_usd = cost_usd + ? WHERE id = ?')
        .bind(res.tokensIn + res.tokensOut, res.cost, blockId).run();

      return res.data;
    });

    // Deliberation loop: render → critique → possibly loop
    let renderings = null;
    let round = 0;
    let converged = false;

    while (round < MAX_DELIB_ROUNDS && !converged) {
      round++;

      // Render: 3 translators in parallel
      renderings = await step.do(`render-round-${round}`, async () => {
        await db.prepare("UPDATE job_blocks SET status = 'translating', delib_round = ? WHERE id = ?").bind(round, blockId).run();

        const translatorConfigs = [
          { role: 'literary', persona: `You are Hamilton, the Literary Translator on the CTAI Committee. Your approach mirrors the elevated, majestic style of Shoghi Effendi's translations.\n\nStyle: Formal, elevated English prose. Archaic pronouns (Thou, Thee, Thy) for the Divine. Inverted syntax for dignity. Rich KJV-tradition vocabulary. Prioritize beauty and spiritual impact.` },
          { role: 'persian', persona: `You are Farid, the Persian Studies Translator on the CTAI Committee. Your approach emphasizes philological accuracy and cultural context.\n\nStyle: Precise, scholarly English preserving semantic structure. Attention to Persian literary conventions. Transliteration with glosses. Sufi/mystical terminology awareness. Balance accuracy and readability.` },
          { role: 'theological', persona: `You are Bakri, the Theological Translator on the CTAI Committee. Your approach emphasizes doctrinal precision and scriptural cross-references.\n\nStyle: Clear, precise English for theological content. Doctrinal terminology awareness. Cross-references to parallel passages. Arabic grammatical constructions. Clarity over flourish.` },
        ];

        const results = await Promise.all(translatorConfigs.map(async ({ role, persona }) => {
          const prevCritiques = round > 1 ? `\n\nPrevious round critiques to address:\n${JSON.stringify(renderings?.map(r => r.critiques).filter(Boolean))}` : '';
          const res = await trackedCallAnthropic({
            db, jobId, phase: `render_r${round}`, agentRole: `render_${role}`,
            apiKey,
            system: persona,
            messages: [{ role: 'user', content: `Render this ${langName} text into English. Follow concordance precedents where they exist.\n\nReference packet: ${JSON.stringify(research)}\n\nSource text:\n${block.sourceText}${prevCritiques}\n\nReturn JSON: { "rendering": [{ "source": "source phrase", "translation": "English rendering" }] }` }],
            json: true,
          });
          return { role, data: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost };
        }));

        const totalIn = results.reduce((s, r) => s + r.tokensIn, 0);
        const totalOut = results.reduce((s, r) => s + r.tokensOut, 0);
        const totalCost = results.reduce((s, r) => s + r.cost, 0);

        await recordPhase(db, { jobId, phase: 'render_round', agentRole: 'render', round, input: { blockId, round }, output: { renderings: results.map(r => ({ role: r.role, data: r.data })) }, tokensIn: totalIn, tokensOut: totalOut, cost: totalCost });
        await db.prepare('UPDATE job_blocks SET tokens_used = tokens_used + ?, cost_usd = cost_usd + ? WHERE id = ?')
          .bind(totalIn + totalOut, totalCost, blockId).run();

        return results.map(r => ({ role: r.role, data: r.data }));
      });

      // Critique: each translator critiques the others
      const critiqueResult = await step.do(`critique-round-${round}`, async () => {
        await db.prepare("UPDATE job_blocks SET status = 'deliberating' WHERE id = ?").bind(blockId).run();

        const critiques = await Promise.all(renderings.map(async (rendering) => {
          const others = renderings.filter(r => r.role !== rendering.role);
          const res = await trackedCallAnthropic({
            db, jobId, phase: `critique_r${round}`, agentRole: `critique_${rendering.role}`,
            apiKey,
            system: `You are the ${rendering.role} translator. Critique the other translators' renderings. Identify agreements, disagreements, and suggested improvements.`,
            messages: [{ role: 'user', content: `Your rendering: ${JSON.stringify(rendering.data)}\nOther renderings: ${JSON.stringify(others.map(o => ({ role: o.role, data: o.data })))}\n\nReturn JSON: { "agreements": [...], "disagreements": [...], "suggestions": [...] }` }],
            json: true,
          });
          return { role: rendering.role, data: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost };
        }));

        const totalIn = critiques.reduce((s, r) => s + r.tokensIn, 0);
        const totalOut = critiques.reduce((s, r) => s + r.tokensOut, 0);
        const totalCost = critiques.reduce((s, r) => s + r.cost, 0);

        const hasDisagreements = critiques.some(c => c.data?.disagreements?.length > 0);

        await recordPhase(db, { jobId, phase: 'critique_round', agentRole: 'critique', round, input: { blockId, round }, output: { critiques: critiques.map(c => ({ role: c.role, data: c.data })), converged: !hasDisagreements }, tokensIn: totalIn, tokensOut: totalOut, cost: totalCost });
        await db.prepare('UPDATE job_blocks SET tokens_used = tokens_used + ?, cost_usd = cost_usd + ? WHERE id = ?')
          .bind(totalIn + totalOut, totalCost, blockId).run();

        // Attach critiques to renderings for next round
        renderings = renderings.map(r => {
          const critique = critiques.find(c => c.role === r.role);
          return { ...r, critiques: critique?.data };
        });

        return { converged: !hasDisagreements };
      });

      converged = critiqueResult.converged;
    }

    // Converge: synthesize final rendering
    const convergeResult = await step.do('converge', async () => {
      await db.prepare("UPDATE job_blocks SET status = 'converging' WHERE id = ?").bind(blockId).run();

      const res = await trackedCallAnthropic({
        db, jobId, phase: 'converge', agentRole: 'convergence',
        apiKey,
        system: 'You are the convergence synthesizer. Produce a final phrase-by-phrase rendering from committee deliberation. Select the best rendering for each phrase, weighing concordance fidelity, semantic accuracy, and stylistic quality.',
        messages: [{ role: 'user', content: `Synthesize the final translation from these committee deliberation results.\n\nRenderings: ${JSON.stringify(renderings)}\n\nReturn JSON: { "final_rendering": [{ "source": "source phrase", "translation": "final English rendering", "notes": "brief rationale" }] }` }],
        json: true,
      });

      await recordPhase(db, { jobId, phase: 'converge', agentRole: 'convergence', input: { blockId }, output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      await db.prepare('UPDATE job_blocks SET tokens_used = tokens_used + ?, cost_usd = cost_usd + ? WHERE id = ?')
        .bind(res.tokensIn + res.tokensOut, res.cost, blockId).run();

      return res.data;
    });

    // Mark block complete and check if this is the last one
    await step.do('check-completion', async () => {
      await db.prepare(
        "UPDATE job_blocks SET status = 'complete', output_json = ?, completed_at = datetime('now') WHERE id = ?"
      ).bind(JSON.stringify(convergeResult), blockId).run();

      // Atomic increment + check — race-safe
      const updated = await db.prepare(
        "UPDATE translation_jobs SET blocks_done = blocks_done + 1 WHERE id = ? RETURNING blocks_done, total_blocks"
      ).bind(jobId).first();

      if (updated && updated.blocks_done >= updated.total_blocks) {
        // Last block — spawn FinalizeWorkflow
        const instance = await this.env.FINALIZE_WORKFLOW.create({
          params: { jobId },
        });
        await db.prepare("UPDATE translation_jobs SET status = 'assembling', finalize_workflow_id = ? WHERE id = ?")
          .bind(instance.id, jobId).run();
      }
    });
  }
}

// --- FinalizeWorkflow ---
// Assembles all blocks, runs fidelity review, publishes, sends email

export class FinalizeWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId } = event.payload;
    const db = this.env.USERS_DB;
    const apiKey = this.env.ANTHROPIC_API_KEY;
    const bucket = this.env.TRANSLATIONS_BUCKET;

    const jobData = await step.do('load-job-data', async () => {
      const job = await db.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first();
      if (!job) throw new Error(`Job ${jobId} not found`);
      const blocks = await db.prepare(
        'SELECT * FROM job_blocks WHERE job_id = ? ORDER BY block_index'
      ).bind(jobId).all();
      return {
        sourceText: job.source_text,
        sourceLang: job.source_lang,
        style: job.style,
        workTitle: job.work_title,
        workId: job.work_id,
        userId: job.user_id,
        userEmail: job.user_email,
        blocks: blocks.results.map(b => ({
          index: b.block_index,
          sourceText: b.source_text,
          output: b.output_json ? JSON.parse(b.output_json) : null,
        })),
      };
    });

    const langName = jobData.sourceLang === 'ar' ? 'Arabic' : 'Persian';

    // Assemble all blocks into a single document
    const assembled = await step.do('assemble', async () => {
      await db.prepare("UPDATE translation_jobs SET status = 'assembling' WHERE id = ?").bind(jobId).run();

      const allRenderings = jobData.blocks.map(b => b.output).filter(Boolean);
      const res = await trackedCallAnthropic({
        db, jobId, phase: 'assemble', agentRole: 'assembly',
        apiKey,
        system: `You are the Assembly Agent for the CTAI Committee Translation system. Compose phrase-level renderings into flowing English paragraphs.\n\nPreserve the exact wording chosen by the committee. Add only minimal connective tissue. Maintain paragraph boundaries and register.`,
        messages: [{ role: 'user', content: `Compose these block-level renderings into a single flowing document.\n\nSource text: ${jobData.sourceText}\n\nBlock renderings: ${JSON.stringify(allRenderings)}\n\nReturn JSON: { "paragraphs": [{ "source": "source paragraph", "translation": "English paragraph", "phrases": [{ "source": "...", "translation": "..." }] }] }` }],
        maxTokens: 8192,
        json: true,
      });

      await recordPhase(db, { jobId, phase: 'assemble', agentRole: 'assembly', output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      return res.data;
    });

    // Fidelity review
    const reviewed = await step.do('fidelity-review', async () => {
      await db.prepare("UPDATE translation_jobs SET status = 'reviewing' WHERE id = ?").bind(jobId).run();

      const res = await trackedCallAnthropic({
        db, jobId, phase: 'fidelity_review', agentRole: 'fidelity',
        apiKey,
        system: `You are the Fidelity Reviewer for the CTAI Committee Translation system. Compare the assembled English translation against the original ${langName} source. Flag semantic drift, missed content, added content, register inconsistency, and concordance violations.\n\nIf the translation passes review, set approved: true. If issues are critical, set approved: false.`,
        messages: [{ role: 'user', content: `Review this translation for fidelity.\n\nSource: ${jobData.sourceText}\nTranslation: ${JSON.stringify(assembled)}\n\nReturn JSON: { "approved": true/false, "issues": [...], "final_output": { "paragraphs": [{ "source": "...", "translation": "...", "phrases": [{ "source": "...", "translation": "..." }] }] } }` }],
        maxTokens: 8192,
        json: true,
      });

      await recordPhase(db, { jobId, phase: 'review', agentRole: 'fidelity', output: res.data, tokensIn: res.tokensIn, tokensOut: res.tokensOut, cost: res.cost });
      return res.data;
    });

    const finalOutput = reviewed.final_output || assembled;

    // Store output in R2
    const r2Key = await step.do('store-output', async () => {
      const key = `translations/${jobId}/output.json`;
      await bucket.put(key, JSON.stringify(finalOutput));
      return key;
    });

    // Publish to D1
    const translationId = await step.do('publish', async () => {
      const tId = generateId();
      // Get sponsor info
      let commissionedBy = null;
      try {
        const user = await db.prepare('SELECT name FROM users WHERE id = ?').bind(jobData.userId).first();
        commissionedBy = user?.name || null;
      } catch { /* best effort */ }

      await db.prepare(
        `INSERT INTO published_translations (id, job_id, source_text, source_lang, style, work_title, output_json, commissioned_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(tId, jobId, jobData.sourceText, jobData.sourceLang, jobData.style,
        jobData.workTitle || null, JSON.stringify(finalOutput), commissionedBy).run();

      await db.prepare("UPDATE translation_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?")
        .bind(jobId).run();

      return tId;
    });

    // Send completion email
    await step.do('send-email', async () => {
      const resendKey = this.env.RESEND_API_KEY;
      if (!resendKey || !jobData.userEmail) return;

      const origin = 'https://ctai.info';
      const html = completionEmailHtml({
        workTitle: jobData.workTitle,
        translationUrl: `${origin}/translations/${translationId}`,
        sponsorName: null,
      });

      try {
        await sendEmail({
          apiKey: resendKey,
          to: jobData.userEmail,
          subject: `Translation complete: ${jobData.workTitle || 'Untitled'}`,
          html,
        });

        // Log email
        await db.prepare(
          `INSERT INTO email_log (id, job_id, user_id, to_email, subject, status)
           VALUES (?, ?, ?, ?, ?, 'sent')`
        ).bind(generateId(), jobId, jobData.userId, jobData.userEmail,
          `Translation complete: ${jobData.workTitle || 'Untitled'}`).run();
      } catch (err) {
        console.error('[email] Failed to send completion email:', err.message);
        // Log failure but don't fail the workflow
        await db.prepare(
          `INSERT INTO email_log (id, job_id, user_id, to_email, subject, status)
           VALUES (?, ?, ?, ?, ?, 'failed')`
        ).bind(generateId(), jobId, jobData.userId, jobData.userEmail,
          `Translation complete: ${jobData.workTitle || 'Untitled'}`).run();
      }
    });
  }
}

// --- Service Binding API + Cron Handler ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST /start — create a SegmentWorkflow instance
    if (request.method === 'POST' && path === '/start') {
      try {
        const { jobId, text, lang, style, userEmail } = await request.json();
        if (!jobId) return jsonResponse({ error: 'jobId required' }, 400);

        // Store user email on job for completion notification
        if (userEmail) {
          await env.USERS_DB.prepare('UPDATE translation_jobs SET user_email = ? WHERE id = ?')
            .bind(userEmail, jobId).run();
        }

        const instance = await env.SEGMENT_WORKFLOW.create({
          params: { jobId },
        });

        await env.USERS_DB.prepare('UPDATE translation_jobs SET segment_workflow_id = ? WHERE id = ?')
          .bind(instance.id, jobId).run();

        return jsonResponse({ ok: true, workflowId: instance.id });
      } catch (err) {
        console.error('[fetch/start] Error:', err);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // GET /status/:jobId — return job + blocks from D1
    if (request.method === 'GET' && path.startsWith('/status/')) {
      try {
        const jobId = path.split('/status/')[1];
        if (!jobId) return jsonResponse({ error: 'jobId required' }, 400);

        const job = await env.USERS_DB.prepare('SELECT * FROM translation_jobs WHERE id = ?')
          .bind(jobId).first();
        if (!job) return jsonResponse({ error: 'Job not found' }, 404);

        const blocks = await env.USERS_DB.prepare(
          'SELECT id, block_index, status, delib_round, cost_usd FROM job_blocks WHERE job_id = ? ORDER BY block_index'
        ).bind(jobId).all();

        return jsonResponse({
          job: {
            id: job.id, status: job.status, totalBlocks: job.total_blocks,
            blocksDone: job.blocks_done, estimatedCost: job.estimated_cost_usd,
            actualCost: job.actual_cost_usd, totalTokens: job.total_tokens,
            workTitle: job.work_title, startedAt: job.started_at,
            completedAt: job.completed_at, errorMessage: job.error_message,
          },
          blocks: blocks.results.map(b => ({
            id: b.id, index: b.block_index, status: b.status,
            delibRound: b.delib_round, cost: b.cost_usd,
          })),
        });
      } catch (err) {
        console.error('[fetch/status] Error:', err);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },

  // Weekly digest email — Monday 2pm UTC
  async scheduled(event, env) {
    const db = env.USERS_DB;
    const resendKey = env.RESEND_API_KEY;
    if (!resendKey) { console.log('[cron] No RESEND_API_KEY, skipping digest'); return; }

    const origin = 'https://ctai.info';
    const sessionSecret = env.SESSION_SECRET || 'ctai-default-secret';

    // New translations published this week
    const newTranslations = await db.prepare(
      "SELECT id, work_title, style FROM published_translations WHERE published_at > datetime('now', '-7 days') ORDER BY published_at DESC"
    ).all();

    // Most popular (top 5 by view count)
    const popular = await db.prepare(
      "SELECT id, work_title, view_count FROM published_translations ORDER BY view_count DESC LIMIT 5"
    ).all();

    // Skip if nothing to report and no popular content
    if (!newTranslations.results.length && !popular.results.length) {
      console.log('[cron] No content for digest, skipping');
      return;
    }

    // Opted-in users
    const users = await db.prepare(
      "SELECT id, email, name FROM users WHERE email_digest = 1 AND email IS NOT NULL"
    ).all();

    if (!users.results.length) {
      console.log('[cron] No opted-in users, skipping');
      return;
    }

    const html = digestEmailHtml({
      newTranslations: newTranslations.results,
      popular: popular.results,
      origin,
    });
    const subject = newTranslations.results.length
      ? `CTAI Weekly: ${newTranslations.results.length} new translation${newTranslations.results.length > 1 ? 's' : ''}`
      : 'CTAI Weekly Digest';

    // Send in batches of 100 via Resend batch API
    for (let i = 0; i < users.results.length; i += 100) {
      const batch = users.results.slice(i, i + 100);
      const emails = batch.map(u => {
        // HMAC token for unsubscribe
        const unsubToken = generateId(32); // simplified — production should use HMAC
        const unsubUrl = `${origin}/api/email/unsubscribe?uid=${u.id}&token=${unsubToken}`;
        return {
          from: 'CTAI <noreply@ctai.info>',
          to: [u.email],
          subject,
          html: html
            .replace('{{name}}', u.name || 'Friend')
            .replace('{{unsubscribe_url}}', unsubUrl),
        };
      });

      try {
        await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify(emails),
        });
      } catch (err) {
        console.error('[cron] Batch email error:', err.message);
      }
    }

    console.log(`[cron] Digest sent to ${users.results.length} users`);
  },
};

