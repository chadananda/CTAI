#!/usr/bin/env node
// Deterministic fixes for data/jafar.db
// 1. Merge duplicate roots (same transliteration → keep highest-occurrence)
// 2. Normalize pair_id encoding (ʿ → ')
// 3. Normalize ref format → short codes
// 4. Remove placeholders (multiple-baha'i-texts, not_arabic_root)
// 5. Clean malformed root entries (/, (Persian) suffixes)
// 6. Delete orphaned roots (0 occurrences after merges)
// 7. Regenerate slugs via build-concordance-index.js

import Database from 'better-sqlite3';
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');
const bakPath = dbPath + '.bak';

// ── Safety: back up ──
if (!existsSync(bakPath)) {
  copyFileSync(dbPath, bakPath);
  console.log(`Backup created: ${bakPath}`);
} else {
  console.log(`Backup already exists: ${bakPath}`);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // We're managing referential integrity manually

let stats = {
  duplicatesMerged: 0,
  occurrencesReassigned: 0,
  pairIdsNormalized: 0,
  refsNormalized: 0,
  placeholdersRemoved: 0,
  malformedCleaned: 0,
  orphansDeleted: 0,
};

// ── 1. Merge duplicate roots ──
console.log('\n1. Merging duplicate roots...');

const dupGroups = db.prepare(`
  SELECT transliteration, GROUP_CONCAT(id) as ids
  FROM roots
  GROUP BY transliteration
  HAVING COUNT(*) > 1
`).all();

const reassignOcc = db.prepare('UPDATE occurrences SET root_id = ? WHERE root_id = ?');
const deleteRoot = db.prepare('DELETE FROM roots WHERE id = ?');
const getOccCount = db.prepare('SELECT COUNT(*) as cnt FROM occurrences WHERE root_id = ?');
const getRoot = db.prepare('SELECT * FROM roots WHERE id = ?');

const mergeTx = db.transaction(() => {
  for (const group of dupGroups) {
    const ids = group.ids.split(',').map(Number);

    // Find canonical: root with most occurrences
    const withCounts = ids.map(id => ({
      id,
      count: getOccCount.get(id).cnt,
      root: getRoot.get(id),
    }));
    withCounts.sort((a, b) => b.count - a.count);

    const canonical = withCounts[0];
    const dupes = withCounts.slice(1);

    // Merge similar arrays
    let canonicalSimilar = [];
    try {
      canonicalSimilar = canonical.root.similar ? JSON.parse(canonical.root.similar) : [];
    } catch { /* empty */ }

    for (const dupe of dupes) {
      // Reassign occurrences
      const result = reassignOcc.run(canonical.id, dupe.id);
      stats.occurrencesReassigned += result.changes;

      // Collect similar refs from dupe
      try {
        const dupeSimilar = dupe.root.similar ? JSON.parse(dupe.root.similar) : [];
        for (const s of dupeSimilar) {
          if (s !== canonical.id && !canonicalSimilar.includes(s)) {
            canonicalSimilar.push(s);
          }
        }
      } catch { /* empty */ }

      // Remove dupe from any similar arrays
      canonicalSimilar = canonicalSimilar.filter(s => s !== dupe.id);

      // Delete the duplicate root
      deleteRoot.run(dupe.id);
      stats.duplicatesMerged++;
    }

    // Merge meanings if canonical meaning is shorter
    const allMeanings = withCounts.map(w => w.root.meaning);
    const longestMeaning = allMeanings.reduce((a, b) => a.length >= b.length ? a : b, '');
    if (longestMeaning.length > canonical.root.meaning.length) {
      db.prepare('UPDATE roots SET meaning = ? WHERE id = ?').run(longestMeaning, canonical.id);
    }

    // Update similar
    if (canonicalSimilar.length > 0) {
      db.prepare('UPDATE roots SET similar = ? WHERE id = ?').run(
        JSON.stringify(canonicalSimilar), canonical.id
      );
    }
  }
});
mergeTx();
console.log(`  Merged ${stats.duplicatesMerged} duplicate roots, reassigned ${stats.occurrencesReassigned} occurrences`);

// ── 2. Normalize pair_id encoding ──
console.log('\n2. Normalizing pair_id encoding...');

const pairIdTx = db.transaction(() => {
  // ʿ (U+02BF modifier letter left half ring) → ' (straight apostrophe)
  // ʾ (U+02BE modifier letter right half ring) → ' (straight apostrophe) — only in pair_id
  const result = db.prepare(`
    UPDATE occurrences
    SET pair_id = REPLACE(REPLACE(pair_id, X'CABF', ''''), X'CABE', '''')
    WHERE pair_id LIKE '%' || X'CABF' || '%' OR pair_id LIKE '%' || X'CABE' || '%'
  `).run();
  stats.pairIdsNormalized = result.changes;
});
pairIdTx();
console.log(`  Normalized ${stats.pairIdsNormalized} pair_ids`);

// ── 3. Normalize ref format ──
console.log('\n3. Normalizing ref format...');

const REF_MAP = {
  'Epistle to the Son of the Wolf': 'ESW',
  'Gleanings': 'GWB',
  'Kitab-i-Iqan': 'KIQ',
  'Kitab-i-\'Ahd': 'Ahd',
  'Kitab-i-ʿAhd': 'Ahd',
  'The Hidden Words': 'HW',
  'Prayers and Meditations': 'P&M',
  'Will and Testament': 'W&T',
  'Fire Tablet': 'Fire',
  'Tablet of Ahmad': 'Ahmad',
  'Tablet of Carmel': 'Carmel',
  'Tablet of the Holy Mariner': 'Mariner',
  'Multiple Baha\'i texts': 'Multiple',
};

const refTx = db.transaction(() => {
  for (const [full, abbr] of Object.entries(REF_MAP)) {
    // Handle refs like "Full Name §X§Y" or "Full Name§X§Y"
    const rows = db.prepare(
      `SELECT id, ref FROM occurrences WHERE ref LIKE ? || '%'`
    ).all(full);

    for (const row of rows) {
      // Extract the §-suffix part
      const suffix = row.ref.slice(full.length).replace(/^\s*/, '');
      // Ensure space before §
      const newRef = suffix ? `${abbr} ${suffix.startsWith('§') ? suffix : '§' + suffix}` : abbr;
      db.prepare('UPDATE occurrences SET ref = ? WHERE id = ?').run(newRef, row.id);
      stats.refsNormalized++;
    }
  }
});
refTx();
console.log(`  Normalized ${stats.refsNormalized} refs`);

// ── 4. Remove placeholders ──
console.log('\n4. Removing placeholder entries...');

const placeholderTx = db.transaction(() => {
  // Remove "Multiple Baha'i texts" occurrences
  const r1 = db.prepare(`DELETE FROM occurrences WHERE ref LIKE '%Multiple%'`).run();
  stats.placeholdersRemoved += r1.changes;

  // Remove not_arabic_root entries (root field)
  const notArabic = db.prepare(`SELECT id FROM roots WHERE root = 'not_arabic_root'`).all();
  for (const r of notArabic) {
    const r2 = db.prepare('DELETE FROM occurrences WHERE root_id = ?').run(r.id);
    stats.placeholdersRemoved += r2.changes;
    db.prepare('DELETE FROM roots WHERE id = ?').run(r.id);
  }
});
placeholderTx();
console.log(`  Removed ${stats.placeholdersRemoved} placeholder entries`);

// ── 5. Clean malformed root entries ──
console.log('\n5. Cleaning malformed root entries...');

const cleanTx = db.transaction(() => {
  // Roots with "/" compound notation — split and keep first part
  // If first part already exists as a separate root, merge into it
  const compoundRoots = db.prepare(`SELECT id, root, transliteration FROM roots WHERE root LIKE '%/%'`).all();
  for (const r of compoundRoots) {
    const firstRoot = r.root.split('/')[0].trim();
    const firstTranslit = r.transliteration.split('/')[0].trim();
    const existing = db.prepare('SELECT id FROM roots WHERE root = ? AND id != ?').get(firstRoot, r.id);
    if (existing) {
      // Merge: reassign occurrences to existing root, delete this one
      db.prepare('UPDATE occurrences SET root_id = ? WHERE root_id = ?').run(existing.id, r.id);
      db.prepare('DELETE FROM roots WHERE id = ?').run(r.id);
    } else {
      db.prepare('UPDATE roots SET root = ?, transliteration = ? WHERE id = ?').run(firstRoot, firstTranslit, r.id);
    }
    stats.malformedCleaned++;
  }

  // Roots with "(Persian)" in root or meaning — strip the tag
  const persianTagged = db.prepare(`SELECT id, root, meaning FROM roots WHERE root LIKE '%(Persian)%' OR meaning LIKE '%(Persian)%'`).all();
  for (const r of persianTagged) {
    const cleanRoot = r.root.replace(/\s*\(Persian\)\s*/g, '').trim();
    const cleanMeaning = r.meaning.replace(/\s*\(Persian\)\s*/g, '').trim();
    const existing = db.prepare('SELECT id FROM roots WHERE root = ? AND id != ?').get(cleanRoot, r.id);
    if (existing) {
      db.prepare('UPDATE occurrences SET root_id = ? WHERE root_id = ?').run(existing.id, r.id);
      db.prepare('DELETE FROM roots WHERE id = ?').run(r.id);
    } else {
      db.prepare('UPDATE roots SET root = ?, meaning = ? WHERE id = ?').run(cleanRoot, cleanMeaning, r.id);
    }
    stats.malformedCleaned++;
  }

  // Roots with "compound" in meaning
  const compoundMeaning = db.prepare(`SELECT id, root, meaning FROM roots WHERE meaning LIKE '%compound%'`).all();
  for (const r of compoundMeaning) {
    const cleanMeaning = r.meaning.replace(/a compound form;?\s*/gi, '').trim() || r.meaning;
    if (cleanMeaning !== r.meaning) {
      db.prepare('UPDATE roots SET meaning = ? WHERE id = ?').run(cleanMeaning, r.id);
      stats.malformedCleaned++;
    }
  }
});
cleanTx();
console.log(`  Cleaned ${stats.malformedCleaned} malformed entries`);

// ── 6. Delete orphaned roots ──
console.log('\n6. Deleting orphaned roots...');

const orphanTx = db.transaction(() => {
  // Remove orphaned root IDs from other roots' similar arrays first
  const orphans = db.prepare(`
    SELECT r.id FROM roots r
    LEFT JOIN occurrences o ON o.root_id = r.id
    WHERE o.id IS NULL
  `).all().map(r => r.id);

  const orphanSet = new Set(orphans);

  if (orphanSet.size > 0) {
    // Clean similar arrays
    const rootsWithSimilar = db.prepare(`SELECT id, similar FROM roots WHERE similar IS NOT NULL AND similar <> ''`).all();
    for (const r of rootsWithSimilar) {
      try {
        const similar = JSON.parse(r.similar);
        const cleaned = similar.filter(s => !orphanSet.has(s));
        if (cleaned.length !== similar.length) {
          db.prepare('UPDATE roots SET similar = ? WHERE id = ?').run(
            cleaned.length > 0 ? JSON.stringify(cleaned) : null, r.id
          );
        }
      } catch { /* skip malformed */ }
    }

    // Delete orphans
    const result = db.prepare(`
      DELETE FROM roots WHERE id IN (
        SELECT r.id FROM roots r
        LEFT JOIN occurrences o ON o.root_id = r.id
        WHERE o.id IS NULL
      )
    `).run();
    stats.orphansDeleted = result.changes;
  }
});
orphanTx();
console.log(`  Deleted ${stats.orphansDeleted} orphaned roots`);

// ── 7. Clean stale similar references ──
console.log('\n7. Cleaning stale similar references...');

const validIds = new Set(db.prepare('SELECT id FROM roots').all().map(r => r.id));
const similarTx = db.transaction(() => {
  const rootsWithSimilar = db.prepare(`SELECT id, similar FROM roots WHERE similar IS NOT NULL AND similar <> ''`).all();
  let cleaned = 0;
  for (const r of rootsWithSimilar) {
    try {
      const similar = JSON.parse(r.similar);
      const valid = similar.filter(s => validIds.has(s));
      if (valid.length !== similar.length) {
        db.prepare('UPDATE roots SET similar = ? WHERE id = ?').run(
          valid.length > 0 ? JSON.stringify(valid) : null, r.id
        );
        cleaned++;
      }
    } catch { /* skip */ }
  }
  console.log(`  Cleaned ${cleaned} stale similar references`);
});
similarTx();

db.close();

// ── Summary ──
console.log('\n=== Fix Summary ===');
console.log(`  Duplicate roots merged:    ${stats.duplicatesMerged}`);
console.log(`  Occurrences reassigned:    ${stats.occurrencesReassigned}`);
console.log(`  pair_ids normalized:       ${stats.pairIdsNormalized}`);
console.log(`  Refs normalized:           ${stats.refsNormalized}`);
console.log(`  Placeholders removed:      ${stats.placeholdersRemoved}`);
console.log(`  Malformed entries cleaned:  ${stats.malformedCleaned}`);
console.log(`  Orphaned roots deleted:    ${stats.orphansDeleted}`);
console.log('\nDone. Run audit-jafar.js again to verify.');
