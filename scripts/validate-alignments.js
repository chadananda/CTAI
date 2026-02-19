#!/usr/bin/env node
/**
 * Validate alignment quality across all corpus paragraphs.
 *
 * Checks:
 * 1. Every paragraph has alignment data
 * 2. All ar/en pairs are non-empty strings
 * 3. ar text exists as exact substring of source_text
 * 4. en text exists as exact substring of translation
 * 5. No duplicate en values within a paragraph
 * 6. No overlapping character ranges (src or tgt)
 * 7. Coverage: what % of source and translation words are linked
 * 8. Pair count sanity: not too few, not too many relative to text length
 */
import fs from 'node:fs';
import path from 'node:path';

const CORPUS_DIR = path.resolve('src/content/corpus');

function splitWords(text) {
  return text.match(/\S+/g) || [];
}

function validateParagraph(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const errors = [];
  const warnings = [];
  const slug = `${data.slug || data.work} §${path.basename(filePath, '.json')}`;

  if (!data.alignment || !Array.isArray(data.alignment)) {
    errors.push('Missing or invalid alignment array');
    return { slug, errors, warnings, pairs: 0, srcCoverage: 0, enCoverage: 0 };
  }

  const pairs = data.alignment;
  if (pairs.length === 0) {
    errors.push('Empty alignment array');
    return { slug, errors, warnings, pairs: 0, srcCoverage: 0, enCoverage: 0 };
  }

  // Check each pair
  const seenEn = new Set();
  const srcRanges = [];
  const tgtRanges = [];

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (!p.ar || typeof p.ar !== 'string') {
      errors.push(`Pair ${i}: empty/invalid ar`);
      continue;
    }
    if (!p.en || typeof p.en !== 'string') {
      errors.push(`Pair ${i}: empty/invalid en`);
      continue;
    }

    // Check ar is substring of source
    if (data.source_text && !data.source_text.includes(p.ar)) {
      errors.push(`Pair ${i}: ar "${p.ar.slice(0, 30)}..." not found in source`);
    }

    // Check en is substring of translation
    if (data.translation && !data.translation.includes(p.en)) {
      errors.push(`Pair ${i}: en "${p.en.slice(0, 30)}..." not found in translation`);
    }

    // Duplicate en check
    if (seenEn.has(p.en)) {
      warnings.push(`Pair ${i}: duplicate en "${p.en.slice(0, 30)}..."`);
    }
    seenEn.add(p.en);

    // Collect ranges for overlap check
    if (p.src) srcRanges.push({ idx: i, start: p.src[0], end: p.src[1] });
    if (p.tgt) tgtRanges.push({ idx: i, start: p.tgt[0], end: p.tgt[1] });
  }

  // Check for overlapping ranges
  function checkOverlaps(ranges, label) {
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start < ranges[i - 1].end) {
        warnings.push(`${label} overlap: pair ${ranges[i - 1].idx} [${ranges[i - 1].start}-${ranges[i - 1].end}] and pair ${ranges[i].idx} [${ranges[i].start}-${ranges[i].end}]`);
      }
    }
  }
  if (srcRanges.length) checkOverlaps(srcRanges, 'Source');
  if (tgtRanges.length) checkOverlaps(tgtRanges, 'Target');

  // Coverage analysis
  const srcWords = splitWords(data.source_text || '');
  const enWords = splitWords(data.translation || '');
  const linkedSrcChars = new Set();
  const linkedEnChars = new Set();
  for (const p of pairs) {
    if (p.src) for (let c = p.src[0]; c < p.src[1]; c++) linkedSrcChars.add(c);
    if (p.tgt) for (let c = p.tgt[0]; c < p.tgt[1]; c++) linkedEnChars.add(c);
  }
  const srcCoverage = data.source_text ? linkedSrcChars.size / data.source_text.length : 0;
  const enCoverage = data.translation ? linkedEnChars.size / data.translation.length : 0;

  // Sanity checks on pair count
  const expectedMin = Math.max(1, Math.floor(srcWords.length / 5));
  const expectedMax = srcWords.length * 2;
  if (pairs.length < expectedMin) {
    warnings.push(`Low pair count: ${pairs.length} pairs for ${srcWords.length} source words`);
  }
  if (pairs.length > expectedMax) {
    warnings.push(`High pair count: ${pairs.length} pairs for ${srcWords.length} source words`);
  }

  // Coverage warnings
  if (srcCoverage < 0.3) {
    warnings.push(`Low source coverage: ${(srcCoverage * 100).toFixed(0)}%`);
  }
  if (enCoverage < 0.3) {
    warnings.push(`Low English coverage: ${(enCoverage * 100).toFixed(0)}%`);
  }

  return { slug, errors, warnings, pairs: pairs.length, srcCoverage, enCoverage };
}

// Main
const works = fs.readdirSync(CORPUS_DIR).filter(d =>
  fs.statSync(path.join(CORPUS_DIR, d)).isDirectory()
);

let totalFiles = 0, totalErrors = 0, totalWarnings = 0;
let totalPairs = 0, totalSrcCov = 0, totalEnCov = 0;
const errorFiles = [];
const warningFiles = [];
const lowCoverage = [];

for (const work of works.sort()) {
  const workDir = path.join(CORPUS_DIR, work);
  const files = fs.readdirSync(workDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  let workErrors = 0, workWarnings = 0, workPairs = 0;
  let workSrcCov = 0, workEnCov = 0;

  for (const file of files) {
    const result = validateParagraph(path.join(workDir, file));
    totalFiles++;
    totalPairs += result.pairs;
    totalSrcCov += result.srcCoverage;
    totalEnCov += result.enCoverage;
    workPairs += result.pairs;
    workSrcCov += result.srcCoverage;
    workEnCov += result.enCoverage;

    if (result.errors.length > 0) {
      totalErrors += result.errors.length;
      workErrors += result.errors.length;
      errorFiles.push({ slug: result.slug, errors: result.errors });
    }
    if (result.warnings.length > 0) {
      totalWarnings += result.warnings.length;
      workWarnings += result.warnings.length;
      warningFiles.push({ slug: result.slug, warnings: result.warnings });
    }
    if (result.srcCoverage < 0.3 || result.enCoverage < 0.3) {
      lowCoverage.push({ slug: result.slug, src: result.srcCoverage, en: result.enCoverage, pairs: result.pairs });
    }
  }

  const avgSrc = files.length ? (workSrcCov / files.length * 100).toFixed(0) : 0;
  const avgEn = files.length ? (workEnCov / files.length * 100).toFixed(0) : 0;
  console.log(`${work}: ${files.length} files, ${workPairs} pairs, ${workErrors} errors, ${workWarnings} warnings, coverage: src ${avgSrc}% / en ${avgEn}%`);
}

console.log('\n=== SUMMARY ===');
console.log(`Files:    ${totalFiles}`);
console.log(`Pairs:    ${totalPairs}`);
console.log(`Errors:   ${totalErrors}`);
console.log(`Warnings: ${totalWarnings}`);
console.log(`Avg coverage: src ${(totalSrcCov / totalFiles * 100).toFixed(0)}% / en ${(totalEnCov / totalFiles * 100).toFixed(0)}%`);

if (errorFiles.length > 0) {
  console.log(`\n=== ERRORS (${errorFiles.length} files) ===`);
  for (const f of errorFiles.slice(0, 20)) {
    console.log(`  ${f.slug}:`);
    for (const e of f.errors.slice(0, 5)) console.log(`    - ${e}`);
  }
  if (errorFiles.length > 20) console.log(`  ... and ${errorFiles.length - 20} more`);
}

if (lowCoverage.length > 0) {
  console.log(`\n=== LOW COVERAGE (${lowCoverage.length} files) ===`);
  lowCoverage.sort((a, b) => (a.src + a.en) - (b.src + b.en));
  for (const f of lowCoverage.slice(0, 20)) {
    console.log(`  ${f.slug}: src ${(f.src * 100).toFixed(0)}% / en ${(f.en * 100).toFixed(0)}% (${f.pairs} pairs)`);
  }
  if (lowCoverage.length > 20) console.log(`  ... and ${lowCoverage.length - 20} more`);
}

process.exit(totalErrors > 0 ? 1 : 0);
