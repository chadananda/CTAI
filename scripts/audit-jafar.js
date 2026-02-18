#!/usr/bin/env node
// Read-only audit of data/jafar.db → tmp/jafar-audit-report.json
// Checks: duplicate roots, skeleton mismatches, orphans, encoding splits,
//         malformed entries, non-trilateral Arabic roots, stub data

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');
const outDir = join(__dirname, '..', 'tmp');
const outPath = join(outDir, 'jafar-audit-report.json');

mkdirSync(outDir, { recursive: true });

const db = new Database(dbPath, { readonly: true });

// ── Language heuristic ──
// Root is Persian-native if it contains گ پ چ ژ
const PERSIAN_LETTERS = /[گپچژ]/;
function isPersianRoot(root) {
  return PERSIAN_LETTERS.test(root);
}

// ── Arabic transliteration → consonant map ──
const ARABIC_CONSONANT_MAP = {
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'ḥ', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 'ṣ', 'ض': 'ḍ', 'ط': 'ṭ', 'ظ': 'ẓ', 'ع': 'ʿ', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ک': 'k', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ی': 'y',
  // hamza variants all map to ʾ
  'ء': 'ʾ', 'أ': 'ʾ', 'إ': 'ʾ', 'ؤ': 'ʾ', 'ئ': 'ʾ', 'ا': 'ʾ',
  'آ': 'ʾ',
  // taa marbuta
  'ة': 'h',
};

/** Extract consonant skeleton from an Arabic form (strip vowels, diacritics) */
function consonantSkeleton(form) {
  // Remove common prefixes: ال, و, ب, ف, ک, ل
  let s = form.normalize('NFC');
  // Strip tashkil (U+064B-U+065F), superscript alef (U+0670), tatweel (U+0640)
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  // Remove alif-lam prefix
  s = s.replace(/^ال/, '');
  // Map each character to consonant
  const consonants = [];
  for (const ch of s) {
    const mapped = ARABIC_CONSONANT_MAP[ch];
    if (mapped) consonants.push(mapped);
  }
  return consonants;
}

/** Parse root string into radicals: "ح-م-د" → ["ح","م","د"] */
function parseRadicals(root) {
  return root.split('-').map(r => r.trim()).filter(Boolean);
}

/** Check if root consonants appear as subsequence in form's consonant skeleton */
function isSubsequence(rootConsonants, formSkeleton) {
  let ri = 0;
  for (let fi = 0; fi < formSkeleton.length && ri < rootConsonants.length; fi++) {
    if (formSkeleton[fi] === rootConsonants[ri]) ri++;
  }
  return ri === rootConsonants.length;
}

// ── 1. Duplicate roots (same transliteration) ──

const dupQuery = db.prepare(`
  SELECT transliteration, GROUP_CONCAT(id) as ids, GROUP_CONCAT(root, '|') as roots, COUNT(*) as cnt
  FROM roots
  GROUP BY transliteration
  HAVING cnt > 1
  ORDER BY cnt DESC
`);

const duplicateRoots = dupQuery.all().map(row => {
  const ids = row.ids.split(',').map(Number);
  const roots = row.roots.split('|');
  // Get occurrence counts for each
  const details = ids.map((id, i) => {
    const occ = db.prepare('SELECT COUNT(*) as cnt FROM occurrences WHERE root_id = ?').get(id);
    return { id, root: roots[i], occurrences: occ.cnt };
  });
  return {
    transliteration: row.transliteration,
    count: row.cnt,
    entries: details,
    totalOccurrences: details.reduce((s, d) => s + d.occurrences, 0),
  };
});

// ── 2. Consonant skeleton mismatch (Arabic roots only) ──

const skeletonMismatches = [];
const allRoots = db.prepare('SELECT id, root, transliteration, meaning FROM roots').all();
const getOccurrences = db.prepare('SELECT id, form, en, ref FROM occurrences WHERE root_id = ?');

for (const root of allRoots) {
  if (isPersianRoot(root.root)) continue; // Skip Persian stems

  const radicals = parseRadicals(root.root);
  const rootConsonants = radicals.map(r => ARABIC_CONSONANT_MAP[r] || r).filter(Boolean);
  if (rootConsonants.length === 0) continue;

  const occs = getOccurrences.all(root.id);
  for (const occ of occs) {
    const skeleton = consonantSkeleton(occ.form);
    if (skeleton.length === 0) continue;

    if (!isSubsequence(rootConsonants, skeleton)) {
      skeletonMismatches.push({
        rootId: root.id,
        root: root.root,
        transliteration: root.transliteration,
        meaning: root.meaning,
        occurrenceId: occ.id,
        form: occ.form,
        en: occ.en,
        ref: occ.ref,
        rootConsonants: rootConsonants.join('-'),
        formSkeleton: skeleton.join('-'),
      });
    }
  }
}

// ── 3. Non-trilateral Arabic roots ──

const nonTrilateral = allRoots
  .filter(r => !isPersianRoot(r.root))
  .filter(r => {
    const radicals = parseRadicals(r.root);
    return radicals.length > 4 || radicals.length < 3;
  })
  .map(r => {
    const occ = db.prepare('SELECT COUNT(*) as cnt FROM occurrences WHERE root_id = ?').get(r.id);
    return {
      id: r.id,
      root: r.root,
      transliteration: r.transliteration,
      radicalCount: parseRadicals(r.root).length,
      occurrences: occ.cnt,
    };
  });

// ── 4. Orphaned roots (0 occurrences) ──

const orphanedRoots = db.prepare(`
  SELECT r.id, r.root, r.transliteration, r.meaning
  FROM roots r
  LEFT JOIN occurrences o ON o.root_id = r.id
  WHERE o.id IS NULL
`).all();

// ── 5. Encoding splits in pair_id ──

const pairIdSlugs = db.prepare('SELECT DISTINCT pair_id FROM occurrences').all().map(r => r.pair_id);
const normalizedPairs = new Map();
for (const pid of pairIdSlugs) {
  // Normalize Unicode: ʿ (U+02BF) → ' (straight apostrophe)
  const norm = pid.normalize('NFC').replace(/\u02BF/g, "'").replace(/\u02BE/g, "'");
  if (!normalizedPairs.has(norm)) normalizedPairs.set(norm, []);
  normalizedPairs.get(norm).push(pid);
}
const encodingSplits = [...normalizedPairs.entries()]
  .filter(([, variants]) => variants.length > 1)
  .map(([normalized, variants]) => {
    const counts = variants.map(v => {
      const cnt = db.prepare('SELECT COUNT(*) as cnt FROM occurrences WHERE pair_id = ?').get(v);
      return { pair_id: v, count: cnt.cnt };
    });
    return { normalized, variants: counts };
  });

// ── 6. Malformed entries ──

const malformedRoots = allRoots.filter(r => {
  return r.root.includes('/') ||
    r.root.includes('(Persian)') ||
    r.root === 'not_arabic_root' ||
    r.root.includes('compound') ||
    r.meaning.includes('(Persian)');
}).map(r => {
  const occ = db.prepare('SELECT COUNT(*) as cnt FROM occurrences WHERE root_id = ?').get(r.id);
  return { id: r.id, root: r.root, transliteration: r.transliteration, meaning: r.meaning, occurrences: occ.cnt };
});

// ── 7. Stub data (en = "None provided" or similar) ──

const stubOccurrences = db.prepare(`
  SELECT id, root_id, form, en, ref, pair_id
  FROM occurrences
  WHERE LOWER(en) = 'none provided'
    OR LOWER(en) = 'none provided for this word in passages'
    OR en = ''
`).all();

// ── 8. Work count and ref format inconsistencies ──

const workNames = db.prepare(`
  SELECT DISTINCT
    CASE
      WHEN ref LIKE '% §%' THEN SUBSTR(ref, 1, INSTR(ref, ' §') - 1)
      WHEN ref LIKE '%§%' THEN SUBSTR(ref, 1, INSTR(ref, '§') - 1)
      ELSE ref
    END as work
  FROM occurrences
  ORDER BY work
`).all().map(r => r.work);

// Ref format: count abbreviations vs full names
const refAbbrCount = db.prepare("SELECT COUNT(*) as cnt FROM occurrences WHERE ref LIKE 'ESW%' OR ref LIKE 'GWB%' OR ref LIKE 'KIQ%' OR ref LIKE 'HW%' OR ref LIKE 'P&M%' OR ref LIKE 'W&T%' OR ref LIKE 'Fire%' OR ref LIKE 'Ahd%' OR ref LIKE 'Ahmad%' OR ref LIKE 'Carmel%' OR ref LIKE 'Mariner%'").get();
const refFullCount = db.prepare("SELECT COUNT(*) as cnt FROM occurrences WHERE ref LIKE 'Epistle%' OR ref LIKE 'Gleanings%' OR ref LIKE 'Kitab%' OR ref LIKE 'Will%' OR ref LIKE 'Prayers%' OR ref LIKE 'The Hidden%' OR ref LIKE 'Tablet of%' OR ref LIKE 'Multiple%'").get();

// ── 9. Low-occurrence roots (1-2 occurrences) ──

const lowOccurrenceRoots = db.prepare(`
  SELECT r.id, r.root, r.transliteration, r.meaning, COUNT(o.id) as cnt
  FROM roots r
  JOIN occurrences o ON o.root_id = r.id
  GROUP BY r.id
  HAVING cnt <= 2
  ORDER BY cnt, r.id
`).all();

// ── 10. Persian roots summary ──

const persianRoots = allRoots.filter(r => isPersianRoot(r.root)).map(r => {
  const occ = db.prepare('SELECT COUNT(*) as cnt FROM occurrences WHERE root_id = ?').get(r.id);
  return { id: r.id, root: r.root, transliteration: r.transliteration, meaning: r.meaning, occurrences: occ.cnt };
});

// ── Build report ──

const report = {
  generated: new Date().toISOString(),
  database: {
    totalRoots: allRoots.length,
    totalOccurrences: db.prepare('SELECT COUNT(*) as cnt FROM occurrences').get().cnt,
    workNames,
    workCount: workNames.length,
    persianRootCount: persianRoots.length,
  },
  issues: {
    duplicateRoots: {
      description: 'Same transliteration mapped to multiple root entries',
      count: duplicateRoots.length,
      totalRootsAffected: duplicateRoots.reduce((s, d) => s + d.count, 0),
      entries: duplicateRoots,
    },
    skeletonMismatches: {
      description: 'Arabic form consonants do not match root (possible misassignment)',
      count: skeletonMismatches.length,
      uniqueRoots: new Set(skeletonMismatches.map(s => s.rootId)).size,
      entries: skeletonMismatches,
    },
    nonTrilateralArabic: {
      description: 'Arabic roots with unusual radical count (<3 or >4)',
      count: nonTrilateral.length,
      entries: nonTrilateral,
    },
    orphanedRoots: {
      description: 'Roots with 0 occurrences',
      count: orphanedRoots.length,
      entries: orphanedRoots,
    },
    encodingSplits: {
      description: 'pair_id values differing only by Unicode normalization',
      count: encodingSplits.length,
      entries: encodingSplits,
    },
    malformedRoots: {
      description: 'Roots with /, (Persian), compound notation, or not_arabic_root',
      count: malformedRoots.length,
      entries: malformedRoots,
    },
    stubData: {
      description: 'Occurrences with "None provided" or empty en field',
      count: stubOccurrences.length,
      entries: stubOccurrences,
    },
    refFormatInconsistency: {
      description: 'Mixed abbreviated and full work names in ref field',
      abbreviated: refAbbrCount.cnt,
      fullName: refFullCount.cnt,
    },
    lowOccurrenceRoots: {
      description: 'Roots with only 1-2 occurrences (high error probability)',
      count: lowOccurrenceRoots.length,
      entries: lowOccurrenceRoots,
    },
  },
  persianRoots: {
    description: 'Roots containing Persian-only letters (informational, not errors)',
    count: persianRoots.length,
    entries: persianRoots,
  },
};

db.close();

writeFileSync(outPath, JSON.stringify(report, null, 2));

// ── Summary ──
console.log('=== Jafar Database Audit Report ===');
console.log(`Database: ${report.database.totalRoots} roots, ${report.database.totalOccurrences} occurrences`);
console.log(`Works detected: ${report.database.workCount} (expected: 11)`);
console.log(`Persian roots: ${report.database.persianRootCount}`);
console.log('');
console.log('Issues found:');
console.log(`  Duplicate roots (same translit): ${report.issues.duplicateRoots.count} groups (${report.issues.duplicateRoots.totalRootsAffected} roots)`);
console.log(`  Skeleton mismatches (Arabic):     ${report.issues.skeletonMismatches.count} occurrences (${report.issues.skeletonMismatches.uniqueRoots} roots)`);
console.log(`  Non-trilateral Arabic roots:      ${report.issues.nonTrilateralArabic.count}`);
console.log(`  Orphaned roots (0 occurrences):   ${report.issues.orphanedRoots.count}`);
console.log(`  Encoding splits in pair_id:       ${report.issues.encodingSplits.count}`);
console.log(`  Malformed root entries:            ${report.issues.malformedRoots.count}`);
console.log(`  Stub data (no English):            ${report.issues.stubData.count}`);
console.log(`  Ref format: ${report.issues.refFormatInconsistency.abbreviated} abbreviated, ${report.issues.refFormatInconsistency.fullName} full name`);
console.log(`  Low-occurrence roots (1-2):        ${report.issues.lowOccurrenceRoots.count}`);
console.log('');
console.log(`Report written to: ${outPath}`);
