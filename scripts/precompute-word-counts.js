#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '../src/content/corpus');
const workDirs = fs.readdirSync(corpusDir).filter(d =>
  fs.statSync(path.join(corpusDir, d)).isDirectory()
);
console.log(`Processing ${workDirs.length} works...\n`);
for (const slug of workDirs) {
  const dir = path.join(corpusDir, slug);
  const metaPath = path.join(dir, '_meta.json');
  if (!fs.existsSync(metaPath)) {
    console.log(`⚠️  ${slug}: no _meta.json, skipping`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const paraFiles = fs.readdirSync(dir).filter(f => f !== '_meta.json' && f.endsWith('.json'));
  const wordCount = paraFiles.reduce((sum, f) => {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    return sum + (p.translation || '').split(/\s+/).filter(Boolean).length;
  }, 0);
  meta.word_count = wordCount;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  console.log(`✓ ${slug.padEnd(35)} ${paraFiles.length.toString().padStart(4)} paragraphs · ${wordCount.toLocaleString().padStart(8)} words`);
}
console.log('\nDone!');
