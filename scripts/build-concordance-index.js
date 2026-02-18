#!/usr/bin/env node
// Builds public/_concordance-index.json from data/jafar.db
// Compact format for client-side as-you-type search

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');
const outPath = join(__dirname, '..', 'public', '_concordance-index.json');

const db = new Database(dbPath, { readonly: true });

// English entries: [display, slug, occurrenceCount, rootCount]
const enRows = db.prepare(`
  SELECT
    TRIM(en) as display,
    LOWER(TRIM(en)) as lookup,
    COUNT(*) as cnt,
    COUNT(DISTINCT root_id) as root_cnt
  FROM occurrences
  GROUP BY LOWER(TRIM(en))
  ORDER BY cnt DESC
`).all();

function slugify(phrase) {
  return phrase
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const en = enRows.map(r => [r.display, slugify(r.display), r.cnt, r.root_cnt]);

// Root entries: [root, transliteration, meaning, occurrenceCount, renderingCount]
const rootRows = db.prepare(`
  SELECT
    r.root,
    r.transliteration,
    r.meaning,
    COUNT(o.id) as cnt,
    COUNT(DISTINCT LOWER(TRIM(o.en))) as rendering_cnt
  FROM roots r
  JOIN occurrences o ON o.root_id = r.id
  GROUP BY r.id
  ORDER BY cnt DESC
`).all();

const roots = rootRows.map(r => [r.root, r.transliteration, r.meaning, r.cnt, r.rendering_cnt]);

const index = { en, roots };
const json = JSON.stringify(index);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json);

console.log(`Concordance index: ${en.length} English entries, ${roots.length} roots (${(json.length / 1024).toFixed(0)}KB)`);
