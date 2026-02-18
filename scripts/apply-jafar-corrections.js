#!/usr/bin/env node
/**
 * Applies human-reviewed corrections from tmp/jafar-root-corrections.json to jafar.db.
 *
 * For each correction with verdict "wrong":
 * - If correct_root already exists in DB → move occurrences to that root
 * - If correct_root is new → create root, move occurrences
 * - Cleans up orphaned roots after all moves
 * - Rebuilds similar cross-references
 *
 * Usage: node scripts/apply-jafar-corrections.js [--dry-run]
 */

import Database from 'better-sqlite3';
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');
const correctionsPath = join(__dirname, '..', 'tmp', 'jafar-root-corrections.json');

const dryRun = process.argv.includes('--dry-run');

if (!existsSync(correctionsPath)) {
  console.error(`No corrections file found: ${correctionsPath}`);
  console.error('Run verify-jafar-roots.js first.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(correctionsPath, 'utf8'));
const corrections = data.corrections.filter(c => c.verdict === 'wrong');

console.log(`Loaded ${corrections.length} corrections from ${correctionsPath}`);

if (corrections.length === 0) {
  console.log('Nothing to apply.');
  process.exit(0);
}

if (dryRun) {
  console.log('\n--dry-run: showing corrections:\n');
  for (const c of corrections.slice(0, 30)) {
    console.log(`  ${c.form}: ${c.current_root} → ${c.correct_root} (${c.confidence}) — ${c.note || ''}`);
  }
  if (corrections.length > 30) console.log(`  ... and ${corrections.length - 30} more`);
  process.exit(0);
}

// Backup
const bakPath = dbPath + '.pre-corrections.bak';
if (!existsSync(bakPath)) {
  copyFileSync(dbPath, bakPath);
  console.log(`Backup: ${bakPath}`);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

const findRoot = db.prepare('SELECT id FROM roots WHERE root = ?');
const insertRoot = db.prepare('INSERT INTO roots (root, transliteration, meaning, similar) VALUES (?, ?, ?, NULL)');
const moveOccurrence = db.prepare('UPDATE occurrences SET root_id = ? WHERE id = ?');
const moveOccurrencesByForm = db.prepare('UPDATE occurrences SET root_id = ? WHERE root_id = ? AND form = ?');

let stats = { moved: 0, newRoots: 0, skipped: 0 };

const applyTx = db.transaction(() => {
  for (const c of corrections) {
    if (!c.correct_root) {
      stats.skipped++;
      continue;
    }

    // Find or create target root
    let targetRoot = findRoot.get(c.correct_root);
    if (!targetRoot) {
      insertRoot.run(
        c.correct_root,
        c.correct_translit || c.correct_root.replace(/-/g, '-'),
        c.note || 'auto-generated from verification'
      );
      targetRoot = findRoot.get(c.correct_root);
      stats.newRoots++;
    }

    // Move occurrences
    if (c.occurrenceIds && c.occurrenceIds.length > 0) {
      for (const occId of c.occurrenceIds) {
        moveOccurrence.run(targetRoot.id, occId);
        stats.moved++;
      }
    } else if (c.current_root_id) {
      // Fallback: move by form + root_id
      const result = moveOccurrencesByForm.run(targetRoot.id, c.current_root_id, c.form);
      stats.moved += result.changes;
    } else {
      stats.skipped++;
    }
  }
});
applyTx();

// Clean up orphaned roots
const orphanResult = db.prepare(`
  DELETE FROM roots WHERE id IN (
    SELECT r.id FROM roots r
    LEFT JOIN occurrences o ON o.root_id = r.id
    WHERE o.id IS NULL
  )
`).run();

// Clean stale similar references
const validIds = new Set(db.prepare('SELECT id FROM roots').all().map(r => r.id));
const rootsWithSimilar = db.prepare(`SELECT id, similar FROM roots WHERE similar IS NOT NULL AND similar <> ''`).all();
for (const r of rootsWithSimilar) {
  try {
    const similar = JSON.parse(r.similar);
    const valid = similar.filter(s => validIds.has(s));
    if (valid.length !== similar.length) {
      db.prepare('UPDATE roots SET similar = ? WHERE id = ?').run(
        valid.length > 0 ? JSON.stringify(valid) : null, r.id
      );
    }
  } catch { /* skip */ }
}

db.close();

console.log('\n=== Apply Summary ===');
console.log(`  Occurrences moved:  ${stats.moved}`);
console.log(`  New roots created:  ${stats.newRoots}`);
console.log(`  Skipped:            ${stats.skipped}`);
console.log(`  Orphans cleaned:    ${orphanResult.changes}`);
console.log('\nRun audit-jafar.js to verify, then build-concordance-index.js to rebuild.');
