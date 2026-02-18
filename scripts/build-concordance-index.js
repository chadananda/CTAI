#!/usr/bin/env node
// Builds public/_concordance-index.json from data/jafar.db
// Also populates the `slug` column on the roots table for SEO-friendly URLs

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');
const outPath = join(__dirname, '..', 'public', '_concordance-index.json');

// Open read-write so we can update root slugs
const db = new Database(dbPath);

// ── Slug generation ──

/** Strip diacritics and special characters from Baha'i transliteration → ASCII */
function asciiTranslit(t) {
  return t
    .replace(/ʿ/g, '')   // ain
    .replace(/ʾ/g, '')   // hamza
    .replace(/ṣ/g, 's')
    .replace(/ṭ/g, 't')
    .replace(/ḥ/g, 'h')
    .replace(/ẓ/g, 'z')
    .replace(/ḍ/g, 'd')
    .replace(/á/g, 'a')
    .replace(/í/g, 'i')
    .replace(/ú/g, 'u')
    .replace(/-/g, '')
    .replace(/[^a-z]/g, '');
}

/** Extract first two meaningful keywords from a meaning string */
function meaningKeywords(m) {
  const words = m.toLowerCase().replace(/[;,()]/g, ' ').split(/\s+/).filter(Boolean);
  const skip = new Set(['to', 'a', 'an', 'the', 'of', 'or', 'be', 'is', 'in', 'on', 'for', 'by', 'at', 'as']);
  const keywords = [];
  for (const w of words) {
    if (skip.has(w) || w.length < 2) continue;
    const clean = w.replace(/[^a-z0-9]/g, '');
    if (clean && !keywords.includes(clean)) {
      keywords.push(clean);
      if (keywords.length >= 2) break;
    }
  }
  return keywords.length ? keywords.join('-') : 'root';
}

function slugify(phrase) {
  return phrase
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Generate root slugs ──

const allRoots = db.prepare('SELECT id, transliteration, meaning FROM roots ORDER BY id').all();

// First pass: generate base slugs
const baseSlugs = allRoots.map(r => ({
  id: r.id,
  slug: asciiTranslit(r.transliteration) + '-' + meaningKeywords(r.meaning),
}));

// Second pass: disambiguate collisions by appending -2, -3, etc.
const seen = new Map();
for (const entry of baseSlugs) {
  const base = entry.slug;
  const count = (seen.get(base) || 0) + 1;
  seen.set(base, count);
  if (count > 1) {
    entry.slug = base + '-' + count;
  }
}

// Write slugs to DB
const updateSlug = db.prepare('UPDATE roots SET slug = ? WHERE id = ?');
const tx = db.transaction(() => {
  for (const entry of baseSlugs) {
    updateSlug.run(entry.slug, entry.id);
  }
});
tx();

console.log(`Slugs: ${baseSlugs.length} roots, ${seen.size} unique base slugs, ${baseSlugs.length - seen.size} disambiguated`);

// ── Build search index ──

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

const en = enRows.map(r => [r.display, slugify(r.display), r.cnt, r.root_cnt]);

// Root entries: [root, slug, transliteration, meaning, occurrenceCount, renderingCount]
const rootRows = db.prepare(`
  SELECT
    r.root,
    r.slug,
    r.transliteration,
    r.meaning,
    COUNT(o.id) as cnt,
    COUNT(DISTINCT LOWER(TRIM(o.en))) as rendering_cnt
  FROM roots r
  JOIN occurrences o ON o.root_id = r.id
  GROUP BY r.id
  ORDER BY cnt DESC
`).all();

const roots = rootRows.map(r => [r.root, r.slug, r.transliteration, r.meaning, r.cnt, r.rendering_cnt]);

const index = { en, roots };
const json = JSON.stringify(index);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json);

db.close();
console.log(`Concordance index: ${en.length} English entries, ${roots.length} roots (${(json.length / 1024).toFixed(0)}KB)`);
