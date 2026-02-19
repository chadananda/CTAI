#!/usr/bin/env node
import { readFileSync, existsSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const CWD = process.cwd();
const DB_PATH = join(CWD, 'data/jafar.db');
const CHECKPOINT_PATH = join(CWD, 'tmp/jafar-build-progress.json');

// Normalize form: strip tashkil + character normalization (matches concordance.js)
function normalizeForm(token) {
  let t = token
    .replace(/[.*,:;\?\!\(\)\[\]\{\}«»\u060C\u061B\u061F\u06D4…\u200C\u200D\u200E\u200F]/g, '');
  t = t.replace(/[\u064B-\u065F\u0670]/g, ''); // strip tashkil
  t = t.replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ی')
    .replace(/ٱ/g, 'ا').replace(/آ/g, 'ا')
    .replace(/أ/g, 'ا').replace(/إ/g, 'ا')
    .replace(/ة/g, 'ه').replace(/ى/g, 'ی');
  return t;
}

console.log('Loading checkpoint...');
const checkpoint = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
console.log(`  Words: ${checkpoint.processed_words.length}`);
console.log(`  Roots: ${Object.keys(checkpoint.roots).length}`);
console.log(`  Occurrences: ${checkpoint.occurrences.length}`);

// Build cross-root links
console.log('Building cross-root links...');
const enToRoots = new Map();
for (const occ of checkpoint.occurrences) {
  const en = occ.en.toLowerCase().trim();
  if (!enToRoots.has(en)) enToRoots.set(en, new Set());
  enToRoots.get(en).add(occ.root_id);
}
for (const [root, data] of Object.entries(checkpoint.roots)) {
  const similar = new Set();
  for (const occ of checkpoint.occurrences) {
    if (occ.root_id !== data.id) continue;
    const en = occ.en.toLowerCase().trim();
    const shared = enToRoots.get(en) || new Set();
    for (const otherId of shared) {
      if (otherId !== data.id) similar.add(otherId);
    }
  }
  data.similar = similar.size > 0 ? JSON.stringify(Array.from(similar)) : null;
}
console.log('✓ Cross-root links built');

// Write SQLite
console.log('Writing SQLite database...');
mkdirSync(join(CWD, 'data'), { recursive: true });
if (existsSync(DB_PATH)) unlinkSync(DB_PATH);

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE roots (
    id              INTEGER PRIMARY KEY,
    root            TEXT NOT NULL UNIQUE,
    transliteration TEXT NOT NULL,
    meaning         TEXT NOT NULL,
    similar         TEXT
  );
  CREATE TABLE occurrences (
    id        INTEGER PRIMARY KEY,
    root_id   INTEGER NOT NULL REFERENCES roots(id),
    form      TEXT NOT NULL,
    form_norm TEXT NOT NULL,
    stem      TEXT NOT NULL,
    en        TEXT NOT NULL,
    src       TEXT NOT NULL,
    tr        TEXT NOT NULL,
    ref       TEXT NOT NULL,
    pair_id   TEXT NOT NULL
  );
  CREATE INDEX idx_occ_form_norm ON occurrences(form_norm);
  CREATE INDEX idx_occ_form ON occurrences(form);
  CREATE INDEX idx_occ_stem ON occurrences(stem);
  CREATE INDEX idx_occ_root ON occurrences(root_id);
  CREATE INDEX idx_occ_en   ON occurrences(en);
`);

const insertRoot = db.prepare(
  'INSERT INTO roots (id, root, transliteration, meaning, similar) VALUES (?, ?, ?, ?, ?)'
);
const insertOcc = db.prepare(
  'INSERT INTO occurrences (root_id, form, form_norm, stem, en, src, tr, ref, pair_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

const insertRoots = db.transaction(() => {
  for (const [root, data] of Object.entries(checkpoint.roots)) {
    insertRoot.run(data.id, root, data.transliteration || '', data.meaning || '', data.similar);
  }
});

const insertOccs = db.transaction(() => {
  for (const occ of checkpoint.occurrences) {
    insertOcc.run(
      occ.root_id,
      occ.form || '',
      normalizeForm(occ.form || ''),
      occ.stem || '',
      occ.en || '',
      occ.src || '',
      occ.tr || '',
      occ.ref || '',
      occ.pair_id || ''
    );
  }
});

insertRoots();
insertOccs();
db.close();

const stats = statSync(DB_PATH);
console.log(`\n✓ Database written to ${DB_PATH}`);
console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  Roots: ${Object.keys(checkpoint.roots).length}`);
console.log(`  Occurrences: ${checkpoint.occurrences.length}`);
