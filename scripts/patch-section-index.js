#!/usr/bin/env node
/**
 * Patch corpus JSON files with section_index from source .md headers.
 * Only adds section_index/section/section_para — preserves all existing data.
 *
 * Usage: node scripts/patch-section-index.js
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { slugify, parseFile, mergePairs } from './parse-corpus.js';

const DATA_DIR = path.resolve('data/shoghi-effendi-translations');
const CORPUS_DIR = path.resolve('src/content/corpus');

const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
let patched = 0;

for (const file of files) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
  const { data: frontmatter, content } = matter(raw);
  const slug = slugify(frontmatter.title);
  const workDir = path.join(CORPUS_DIR, slug);
  if (!fs.existsSync(workDir)) { console.log(`  Skip: ${slug}`); continue; }

  // Re-parse to get headers with section indices
  const rawPairs = parseFile(content, frontmatter);
  const merged = mergePairs(rawPairs);

  console.log(`${frontmatter.title} (${slug}): ${merged.length} merged pairs`);

  for (let i = 0; i < merged.length; i++) {
    const pairIndex = i + 1;
    const jsonPath = path.join(workDir, `${pairIndex}.json`);
    if (!fs.existsSync(jsonPath)) continue;

    const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const sectionIndex = merged[i].header.index; // e.g., "I.1", "II.3", "1"

    const parts = sectionIndex.split('.');
    existing.section_index = sectionIndex;
    existing.section = parts[0];
    existing.section_para = parts.length > 1 ? parseInt(parts[1]) || 1 : 1;

    fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2));
    patched++;
  }
}

console.log(`\nPatched ${patched} files with section_index`);
