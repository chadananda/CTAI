#!/usr/bin/env node
/**
 * Generates scholarly summaries for high-interest concordance entries.
 *
 * For English words with 3+ roots and roots with 5+ English renderings,
 * generates AI explanations of why multiple mappings exist.
 *
 * Stores results in concordance_summaries table in jafar.db.
 * Estimated cost: ~$5 one-time (~500 entries).
 *
 * Usage: ANTHROPIC_API_KEY=sk-... node scripts/build-concordance-summaries.js
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

// Create summaries table if needed
db.exec(`
  CREATE TABLE IF NOT EXISTS concordance_summaries (
    key TEXT PRIMARY KEY,
    summary TEXT NOT NULL
  )
`);

// Find English words with 3+ roots
const enCandidates = db.prepare(`
  SELECT TRIM(en) as display, LOWER(TRIM(en)) as lookup,
         COUNT(DISTINCT root_id) as root_cnt
  FROM occurrences
  GROUP BY LOWER(TRIM(en))
  HAVING root_cnt >= 3
  ORDER BY root_cnt DESC
`).all();

// Find roots with 5+ English renderings
const rootCandidates = db.prepare(`
  SELECT r.id, r.root, r.transliteration, r.meaning,
         COUNT(DISTINCT LOWER(TRIM(o.en))) as rendering_cnt
  FROM roots r
  JOIN occurrences o ON o.root_id = r.id
  GROUP BY r.id
  HAVING rendering_cnt >= 5
  ORDER BY rendering_cnt DESC
`).all();

console.log(`${enCandidates.length} English entries, ${rootCandidates.length} roots to summarize`);

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO concordance_summaries (key, summary) VALUES (?, ?)
`);

let processed = 0;

// English word summaries
for (const entry of enCandidates) {
  const key = `en:${entry.lookup}`;
  const existing = db.prepare('SELECT 1 FROM concordance_summaries WHERE key = ?').get(key);
  if (existing) continue;

  // Get the roots for context
  const roots = db.prepare(`
    SELECT DISTINCT r.root, r.transliteration, r.meaning
    FROM occurrences o
    JOIN roots r ON r.id = o.root_id
    WHERE LOWER(TRIM(o.en)) = ?
  `, ).all(entry.lookup);

  const rootList = roots.map(r => `${r.root} (${r.transliteration}) — ${r.meaning}`).join('\n');

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Shoghi Effendi translated "${entry.display}" from ${entry.root_cnt} different Arabic/Persian roots:

${rootList}

In 2-3 sentences, explain why these different roots all map to the same English word. What semantic nuances does each root bring? Write for a student of Arabic/Persian who wants to understand translation choices.`,
      }],
    });

    insertStmt.run(key, response.content[0].text.trim());
    processed++;
    if (processed % 25 === 0) console.log(`${processed} summaries done`);
  } catch (err) {
    console.warn(`Error for ${entry.display}: ${err.message}`);
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}

// Root summaries
for (const entry of rootCandidates) {
  const key = `root:${entry.transliteration}`;
  const existing = db.prepare('SELECT 1 FROM concordance_summaries WHERE key = ?').get(key);
  if (existing) continue;

  const renderings = db.prepare(`
    SELECT TRIM(en) as rendering, COUNT(*) as cnt
    FROM occurrences
    WHERE root_id = ?
    GROUP BY LOWER(TRIM(en))
    ORDER BY cnt DESC
    LIMIT 10
  `).all(entry.id);

  const renderingList = renderings.map(r => `"${r.rendering}" (${r.cnt}×)`).join(', ');

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Arabic/Persian root ${entry.root} (${entry.transliteration}) — "${entry.meaning}" — was rendered by Shoghi Effendi as ${entry.rendering_cnt} different English words: ${renderingList}.

In 2-3 sentences, explain why this single root maps to so many English renderings. What semantic range does this root cover? Write for a student of Arabic/Persian.`,
      }],
    });

    insertStmt.run(key, response.content[0].text.trim());
    processed++;
    if (processed % 25 === 0) console.log(`${processed} summaries done`);
  } catch (err) {
    console.warn(`Error for root ${entry.root}: ${err.message}`);
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log(`Done. ${processed} new summaries generated.`);
db.close();
