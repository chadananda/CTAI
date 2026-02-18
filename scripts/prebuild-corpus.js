#!/usr/bin/env node
/**
 * Pre-compute corpus metadata and copy paragraph JSON to public/_corpus/.
 *
 * Adds to each _meta.json:
 *   - word_count: total English words across all paragraphs
 *   - search_index: [{i, s, t}, ...] for navigation/search UI
 *
 * Copies paragraph JSON files to public/_corpus/{work}/{n}.json so SSR pages
 * can fetch them as static assets (avoiding 2,530 chunk files in the server bundle).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../src/content/corpus');
const publicCorpusDir = path.resolve(__dirname, '../public/_corpus');

// Ensure public/_corpus exists (overwrite in-place, don't delete — Dropbox metadata files block rmSync)
fs.mkdirSync(publicCorpusDir, { recursive: true });

const workDirs = fs.readdirSync(corpusDir).filter(d =>
  fs.statSync(path.join(corpusDir, d)).isDirectory()
);

console.log(`Processing ${workDirs.length} works...\n`);
let totalCopied = 0;

for (const slug of workDirs) {
  const dir = path.join(corpusDir, slug);
  const metaPath = path.join(dir, '_meta.json');
  if (!fs.existsSync(metaPath)) {
    console.log(`⚠️  ${slug}: no _meta.json, skipping`);
    continue;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const paraFiles = fs.readdirSync(dir).filter(f => f !== '_meta.json' && f.endsWith('.json'));

  // Read and sort all paragraphs
  const allParas = paraFiles
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')))
    .sort((a, b) => a.pair_index - b.pair_index);

  // Word count
  const wordCount = allParas.reduce((sum, p) =>
    sum + (p.translation || '').split(/\s+/).filter(Boolean).length, 0);

  // Search index: compact nav data for each paragraph
  const searchIndex = allParas.map(p => ({
    i: p.pair_index,
    s: p.page_slug ? `${p.pair_index}-${p.page_slug}` : String(p.pair_index),
    t: p.translation.replace(/\n/g, ' ').slice(0, 100).trim(),
  }));

  meta.word_count = wordCount;
  meta.search_index = searchIndex;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  // Copy paragraph JSON files to public/_corpus/{slug}/
  const outDir = path.join(publicCorpusDir, slug);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of paraFiles) {
    fs.copyFileSync(path.join(dir, f), path.join(outDir, f));
    totalCopied++;
  }

  const indexKB = (JSON.stringify(searchIndex).length / 1024).toFixed(1);
  console.log(`✓ ${slug.padEnd(35)} ${allParas.length.toString().padStart(4)}¶ · ${wordCount.toLocaleString().padStart(8)} words · ${indexKB}KB index`);
}

console.log(`\n${totalCopied} paragraph files copied to public/_corpus/`);
console.log('Done!');
