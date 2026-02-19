/**
 * fix-alignment.js — Repair alignment phrases to be exact substrings
 *
 * The AI that generated alignment data sometimes paraphrased or slightly
 * modified text rather than extracting exact substrings. This script
 * fuzzy-matches each alignment phrase to the actual source_text/translation
 * and snaps to the nearest exact substring.
 *
 * Usage: node scripts/fix-alignment.js [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const CORPUS_DIR = path.resolve('src/content/corpus');
const PUBLIC_DIR = path.resolve('public/_corpus');

// ── Fuzzy substring finder ──
// Finds the best approximate match for `needle` in `haystack`.
// Returns { start, end, text } or null if no reasonable match.

function fuzzyFind(needle, haystack) {
  if (!needle || !haystack) return null;

  // Try exact match first
  const exactPos = haystack.indexOf(needle);
  if (exactPos !== -1) return { start: exactPos, end: exactPos + needle.length, text: needle };

  // Normalize for comparison (strip diacritics/tashkil for Arabic)
  const norm = s => s.normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Arabic diacritics
    .replace(/[\u0300-\u036F]/g, '') // combining diacritics
    .replace(/\s+/g, ' ').trim();

  const normNeedle = norm(needle);
  const normHay = norm(haystack);

  // Try normalized exact match
  const normPos = normHay.indexOf(normNeedle);
  if (normPos !== -1) {
    // Map normalized position back to original haystack
    const mapped = mapNormPosToOriginal(haystack, normHay, normPos, normNeedle.length);
    if (mapped) return mapped;
  }

  // Try word-level sliding window
  const needleWords = normNeedle.split(/\s+/);
  if (needleWords.length < 2) return null;

  const hayWords = haystack.split(/\s+/);
  const normHayWords = normHay.split(/\s+/);

  let bestScore = 0;
  let bestRange = null;

  for (let start = 0; start <= hayWords.length - Math.max(1, needleWords.length - 2); start++) {
    // Try windows of similar length (+/- 2 words)
    for (let len = Math.max(1, needleWords.length - 2); len <= Math.min(hayWords.length - start, needleWords.length + 2); len++) {
      const windowWords = normHayWords.slice(start, start + len);
      const score = wordOverlap(needleWords, windowWords);

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        // Reconstruct the exact text from haystack
        const origWords = hayWords.slice(start, start + len);
        bestRange = { words: origWords, start, len };
      }
    }
  }

  if (!bestRange) return null;

  // Find the exact character range in the original haystack
  const text = bestRange.words.join(' ');
  const pos = haystack.indexOf(text);
  if (pos !== -1) {
    return { start: pos, end: pos + text.length, text };
  }

  // Fallback: reconstruct from word positions
  return { start: -1, end: -1, text };
}

function wordOverlap(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let matches = 0;
  for (const w of setA) if (setB.has(w)) matches++;
  return matches / Math.max(setA.size, setB.size);
}

function mapNormPosToOriginal(original, normalized, normStart, normLen) {
  // Walk both strings in parallel to find the original character range
  let oi = 0, ni = 0;
  let origStart = -1;

  // Advance to normStart
  while (ni < normStart && oi < original.length) {
    const normChar = original[oi].normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/[\u0300-\u036F]/g, '');
    ni += normChar.length;
    oi++;
  }
  // Handle whitespace normalization
  while (oi < original.length && /\s/.test(original[oi]) && (origStart === -1)) oi++;
  origStart = oi;

  // Advance normLen more normalized chars
  let consumed = 0;
  while (consumed < normLen && oi < original.length) {
    const normChar = original[oi].normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/[\u0300-\u036F]/g, '');
    consumed += normChar.length;
    oi++;
  }

  if (origStart >= 0 && oi > origStart) {
    const text = original.slice(origStart, oi).trim();
    return { start: origStart, end: oi, text };
  }
  return null;
}

// ── Process files ──

let totalFiles = 0;
let fixedFiles = 0;
let totalPhrases = 0;
let fixedPhrases = 0;
let unfixablePhrases = 0;

function processFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const alignment = data.alignment;
  if (!alignment?.length) return;

  totalFiles++;
  const st = data.source_text || '';
  const tr = data.translation || '';
  let changed = false;

  for (let i = 0; i < alignment.length; i++) {
    const pair = alignment[i];

    // Fix Arabic phrase
    if (pair.ar && !st.includes(pair.ar)) {
      totalPhrases++;
      const match = fuzzyFind(pair.ar, st);
      if (match && match.text && st.includes(match.text)) {
        pair.ar = match.text;
        fixedPhrases++;
        changed = true;
      } else {
        unfixablePhrases++;
      }
    }

    // Fix English phrase
    if (pair.en && !tr.includes(pair.en)) {
      totalPhrases++;
      const match = fuzzyFind(pair.en, tr);
      if (match && match.text && tr.includes(match.text)) {
        pair.en = match.text;
        fixedPhrases++;
        changed = true;
      } else {
        unfixablePhrases++;
      }
    }
  }

  if (changed) {
    fixedFiles++;
    if (!DRY_RUN) {
      data.alignment = alignment;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    }
  }
}

// Process both content and public corpus
for (const baseDir of [CORPUS_DIR, PUBLIC_DIR]) {
  if (!fs.existsSync(baseDir)) continue;
  for (const work of fs.readdirSync(baseDir)) {
    const workDir = path.join(baseDir, work);
    if (!fs.statSync(workDir).isDirectory()) continue;
    for (const file of fs.readdirSync(workDir)) {
      if (!file.endsWith('.json') || file.startsWith('_')) continue;
      processFile(path.join(workDir, file));
    }
  }
}

console.log(`\n=== Alignment Repair Report ===`);
console.log(`Files scanned:    ${totalFiles}`);
console.log(`Files modified:   ${fixedFiles}`);
console.log(`Phrases repaired: ${fixedPhrases}`);
console.log(`Unfixable:        ${unfixablePhrases}`);
console.log(`Mode:             ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`);
