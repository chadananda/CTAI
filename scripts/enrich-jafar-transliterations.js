#!/usr/bin/env node
/**
 * Enriches jafar.db occurrences with Baha'i transliterations and morphology labels.
 *
 * For every distinct (root_id, form) pair, generates:
 * - form_translit: Baha'i transliteration (e.g., عادِلُ → ʿádilu)
 * - morphology: brief label (e.g., "active participle", "verbal noun")
 *
 * Uses Claude API. Groups forms by root for efficient batching (~1,896 calls).
 * Estimated cost: ~$19 one-time.
 *
 * Usage: ANTHROPIC_API_KEY=sk-... node scripts/enrich-jafar-transliterations.js
 *
 * After running, deploy pushes the enriched DB to D1 via scripts/deploy.sh
 */

import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY environment variable');
  process.exit(1);
}

const client = new Anthropic({ apiKey });
const db = new Database(dbPath);

// Get all distinct (root_id, form) pairs that lack transliteration
const pairs = db.prepare(`
  SELECT DISTINCT o.root_id, o.form, r.root, r.transliteration, r.meaning
  FROM occurrences o
  JOIN roots r ON r.id = o.root_id
  WHERE o.form_translit IS NULL
  ORDER BY o.root_id
`).all();

console.log(`${pairs.length} forms need transliteration`);

// Group by root
const byRoot = new Map();
for (const p of pairs) {
  if (!byRoot.has(p.root_id)) {
    byRoot.set(p.root_id, {
      root: p.root,
      transliteration: p.transliteration,
      meaning: p.meaning,
      forms: [],
    });
  }
  byRoot.get(p.root_id).forms.push(p.form);
}

console.log(`${byRoot.size} roots to process`);

const updateStmt = db.prepare(`
  UPDATE occurrences SET form_translit = ?, morphology = ?
  WHERE form = ? AND root_id = ?
`);

let processed = 0;

for (const [rootId, group] of byRoot) {
  const formsJson = JSON.stringify(group.forms);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Arabic/Persian root: ${group.root} (${group.transliteration}) — "${group.meaning}"

For each word form below, provide:
1. Baha'i transliteration (using: ʿ ḥ ṣ ẓ á í ú ṭ ḍ sh th kh dh gh)
2. Brief morphology label (e.g., "verbal noun", "active participle", "plural", "Persian form", "definite noun")

Forms: ${formsJson}

Respond as JSON array: [{"form": "...", "translit": "...", "morphology": "..."}, ...]
Only JSON, no commentary.`,
      }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`No JSON for root ${group.root}, skipping`);
      continue;
    }

    const results = JSON.parse(jsonMatch[0]);
    const tx = db.transaction(() => {
      for (const r of results) {
        updateStmt.run(r.translit, r.morphology, r.form, rootId);
      }
    });
    tx();

    processed++;
    if (processed % 50 === 0) {
      console.log(`${processed}/${byRoot.size} roots done`);
    }
  } catch (err) {
    console.warn(`Error for root ${group.root}: ${err.message}`);
  }

  // Rate limit: ~2 req/sec
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log(`Done. ${processed} roots enriched.`);
db.close();
