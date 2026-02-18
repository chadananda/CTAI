#!/usr/bin/env node
/**
 * AI-assisted root verification for jafar.db using Claude Sonnet.
 *
 * Prioritized scope:
 * 1. Skeleton mismatches (form consonants don't match root) — highest confidence wrong
 * 2. Roots with 1-2 occurrences — highest error rate
 *
 * Outputs: tmp/jafar-root-corrections.json — review before applying.
 *
 * Usage: node scripts/verify-jafar-roots.js [--dry-run] [--limit N]
 *   --dry-run   Show what would be sent without calling API
 *   --limit N   Process only first N batches (for testing)
 *
 * Estimated cost: ~$8-15 depending on corpus size after Phase 2 cleanup.
 */

import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'jafar.db');
const outDir = join(__dirname, '..', 'tmp');
const outPath = join(outDir, 'jafar-root-corrections.json');
const progressPath = join(outDir, 'jafar-verify-progress.json');

mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const batchLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

if (!dryRun) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY environment variable (or use --dry-run)');
    process.exit(1);
  }
}

const db = new Database(dbPath, { readonly: true });

// ── Language context for works ──
const WORK_LANGUAGE = {
  'Ahmad': 'Arabic',
  'Carmel': 'Arabic',
  'Mariner': 'Arabic',
  'Fire': 'Arabic',
  'P&M': 'mixed (Arabic prayers in Persian/Arabic compilation)',
  'KIQ': 'Persian (with Arabic quotations)',
  'ESW': 'Persian (with Arabic quotations)',
  'W&T': 'Persian',
  'Ahd': 'Persian',
  'GWB': 'mixed (Arabic and Persian passages)',
  'HW': 'mixed (Arabic and Persian sections)',
};

// ── Persian letter heuristic ──
const PERSIAN_LETTERS = /[گپچژ]/;
function isPersianRoot(root) {
  return PERSIAN_LETTERS.test(root);
}

// ── Consonant mapping (same as audit) ──
const ARABIC_CONSONANT_MAP = {
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'ḥ', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 'ṣ', 'ض': 'ḍ', 'ط': 'ṭ', 'ظ': 'ẓ', 'ع': 'ʿ', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ک': 'k', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ی': 'y',
  'ء': 'ʾ', 'أ': 'ʾ', 'إ': 'ʾ', 'ؤ': 'ʾ', 'ئ': 'ʾ', 'ا': 'ʾ',
  'آ': 'ʾ', 'ة': 'h',
};

function consonantSkeleton(form) {
  let s = form.normalize('NFC');
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  s = s.replace(/^ال/, '');
  const consonants = [];
  for (const ch of s) {
    const mapped = ARABIC_CONSONANT_MAP[ch];
    if (mapped) consonants.push(mapped);
  }
  return consonants;
}

function parseRadicals(root) {
  return root.split('-').map(r => r.trim()).filter(Boolean);
}

function isSubsequence(rootConsonants, formSkeleton) {
  let ri = 0;
  for (let fi = 0; fi < formSkeleton.length && ri < rootConsonants.length; fi++) {
    if (formSkeleton[fi] === rootConsonants[ri]) ri++;
  }
  return ri === rootConsonants.length;
}

// ── Collect candidates ──

// Priority 1: Skeleton mismatches (single-word forms only, Arabic roots)
const allRoots = db.prepare('SELECT id, root, transliteration, meaning FROM roots').all();
const getOccurrences = db.prepare('SELECT id, form, en, ref, src FROM occurrences WHERE root_id = ?');

const candidates = new Map(); // rootId → { root info, occurrences[] with issues }

for (const root of allRoots) {
  if (isPersianRoot(root.root)) continue;

  const radicals = parseRadicals(root.root);
  const rootConsonants = radicals.map(r => ARABIC_CONSONANT_MAP[r] || r).filter(Boolean);
  if (rootConsonants.length === 0) continue;

  const occs = getOccurrences.all(root.id);
  const mismatches = [];

  for (const occ of occs) {
    // Skip multi-word forms (high noise)
    if (occ.form.includes(' ')) continue;

    const skeleton = consonantSkeleton(occ.form);
    if (skeleton.length === 0) continue;

    if (!isSubsequence(rootConsonants, skeleton)) {
      mismatches.push({
        occurrenceId: occ.id,
        form: occ.form,
        en: occ.en,
        ref: occ.ref,
        src: occ.src,
        reason: 'skeleton_mismatch',
      });
    }
  }

  if (mismatches.length > 0) {
    candidates.set(root.id, {
      rootId: root.id,
      root: root.root,
      transliteration: root.transliteration,
      meaning: root.meaning,
      totalOccurrences: occs.length,
      issues: mismatches,
    });
  }
}

// Priority 2: Low-occurrence roots (1-2) not already flagged
const lowOccRoots = db.prepare(`
  SELECT r.id, r.root, r.transliteration, r.meaning, COUNT(o.id) as cnt
  FROM roots r
  JOIN occurrences o ON o.root_id = r.id
  GROUP BY r.id
  HAVING cnt <= 2
`).all();

for (const root of lowOccRoots) {
  if (candidates.has(root.id)) continue; // Already flagged
  if (isPersianRoot(root.root)) continue;

  const occs = getOccurrences.all(root.id);
  candidates.set(root.id, {
    rootId: root.id,
    root: root.root,
    transliteration: root.transliteration,
    meaning: root.meaning,
    totalOccurrences: occs.length,
    issues: occs.map(o => ({
      occurrenceId: o.id,
      form: o.form,
      en: o.en,
      ref: o.ref,
      src: o.src,
      reason: 'low_occurrence',
    })),
  });
}

console.log(`Candidates: ${candidates.size} roots to verify`);

// ── Build batches (group by ~15 roots per batch for efficient API use) ──
const BATCH_SIZE = 15;
const candidateList = [...candidates.values()];
const batches = [];
for (let i = 0; i < candidateList.length; i += BATCH_SIZE) {
  batches.push(candidateList.slice(i, i + BATCH_SIZE));
}

console.log(`Batches: ${batches.length} (${BATCH_SIZE} roots each)`);

if (dryRun) {
  console.log('\n--dry-run: showing first batch prompt:\n');
  const sample = batches[0];
  console.log(buildPrompt(sample));
  console.log(`\nWould process ${Math.min(batchLimit, batches.length)} batches.`);
  const tokenEst = batches.length * 3000; // rough estimate
  console.log(`Estimated tokens: ~${(tokenEst / 1000).toFixed(0)}K input`);
  db.close();
  process.exit(0);
}

// ── Load progress (resume support) ──
let progress = { completed: [], corrections: [] };
if (existsSync(progressPath)) {
  try {
    progress = JSON.parse(readFileSync(progressPath, 'utf8'));
    console.log(`Resuming: ${progress.completed.length} batches already done`);
  } catch { /* start fresh */ }
}

const completedSet = new Set(progress.completed);

// ── API calls ──
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(batch) {
  const entries = batch.map(c => {
    // Deduplicate forms
    const forms = [...new Map(c.issues.map(i => [i.form, i])).values()];
    const formList = forms.map(f => {
      const workLang = WORK_LANGUAGE[f.ref?.split(' ')[0]] || 'unknown';
      return `  - "${f.form}" → "${f.en}" (${f.ref}, work language: ${workLang})`;
    }).join('\n');
    return `Root ${c.root} (${c.transliteration}): "${c.meaning}"\nForms:\n${formList}`;
  }).join('\n\n');

  return `You are an expert in Arabic and Persian morphology, specializing in Bahá'í sacred texts translated by Shoghi Effendi.

Review each entry below. For each form, determine if it is correctly assigned to its root.

Rules:
- Arabic words: identify the trilateral/quadrilateral root (e.g., كتب → ك-ت-ب)
- Persian words: identify the verbal stem or base form (e.g., نوشتن → ن-و-ش-ت)
- Arabic-origin words in Persian texts still use Arabic roots
- Weak verbs: و and ي may drop in conjugated forms (e.g., قال from ق-و-ل is correct)
- Consider prefixes (ال, بـ, لـ, فـ) and suffixes (ة, ات, ين, هم, etc.)

For each form, respond with one of:
- "correct" — root assignment is right
- "wrong" — with the correct root in Arabic script (dash-separated) and transliteration

Respond as JSON array:
[{"form": "...", "current_root": "...", "verdict": "correct|wrong", "correct_root": "...", "correct_translit": "...", "confidence": "high|medium|low", "note": "brief explanation"}]

Only include entries with verdict "wrong". Omit correct entries to save space.
Only output JSON, no commentary.

${entries}`;
}

let batchesProcessed = 0;

for (let i = 0; i < batches.length && batchesProcessed < batchLimit; i++) {
  if (completedSet.has(i)) continue;

  const batch = batches[i];
  const rootIds = batch.map(c => c.rootId);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{ role: 'user', content: buildPrompt(batch) }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);
      // Enrich results with root IDs for application
      for (const result of results) {
        // Find the candidate this form belongs to
        const candidate = batch.find(c =>
          c.issues.some(iss => iss.form === result.form)
        );
        if (candidate) {
          result.current_root_id = candidate.rootId;
          result.current_root_ar = candidate.root;
          result.occurrenceIds = candidate.issues
            .filter(iss => iss.form === result.form)
            .map(iss => iss.occurrenceId);
        }
        progress.corrections.push(result);
      }
    }

    progress.completed.push(i);
    completedSet.add(i);
    batchesProcessed++;

    // Save progress after each batch
    writeFileSync(progressPath, JSON.stringify(progress, null, 2));

    if (batchesProcessed % 5 === 0) {
      console.log(`${batchesProcessed}/${Math.min(batchLimit, batches.length)} batches (${progress.corrections.length} corrections found)`);
    }
  } catch (err) {
    console.warn(`Batch ${i} error: ${err.message}`);
    // Continue to next batch
  }

  // Rate limit
  await new Promise(resolve => setTimeout(resolve, 600));
}

db.close();

// ── Write final corrections ──
const corrections = progress.corrections.filter(c => c.verdict === 'wrong');
const output = {
  generated: new Date().toISOString(),
  totalBatches: batches.length,
  batchesProcessed: progress.completed.length,
  totalCorrections: corrections.length,
  corrections,
};

writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`\nDone. ${progress.completed.length}/${batches.length} batches processed.`);
console.log(`${corrections.length} corrections found.`);
console.log(`Review: ${outPath}`);
console.log('Apply with: node scripts/apply-jafar-corrections.js');
