#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

// Load .env
const envPath = join(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env file */ }

// Handle --clear-cache
if (process.argv.includes('--clear-cache')) {
  const cacheDir = join(process.cwd(), 'tmp', 'research-cache');
  try {
    rmSync(cacheDir, { recursive: true, force: true });
    console.log('Cache cleared: tmp/research-cache/');
  } catch { /* already gone */ }
  if (process.argv.filter(a => !a.startsWith('-')).length <= 2) process.exit(0);
}

const phrase = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
if (!phrase) {
  console.error('Usage: node scripts/test-research.js "Arabic/Persian phrase" [--clear-cache]');
  console.error('Example: node scripts/test-research.js "فِي أَوَّلِ القَوْلِ امْلِكْ قَلْبًا جَيِّدًا حَسَنًا مُنيرًا"');
  process.exit(1);
}

// Detect source language (simple heuristic: Arabic diacritics = ar, else fa)
const sourceLang = /[\u0600-\u06FF]/.test(phrase) ? 'ar' : 'ar';

console.log(`\nAnalyzing: ${phrase}`);
console.log(`Language: ${sourceLang}\n`);

const { analyzePhrase } = await import('../src/lib/research.js');
const start = Date.now();
const result = await analyzePhrase(phrase, sourceLang);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(JSON.stringify(result, null, 2));
console.log(`\n--- ${result.terms.length} terms analyzed in ${elapsed}s ---`);
console.log(`Cached: ${result.terms.filter(t => t.cached).length}/${result.terms.length}`);
