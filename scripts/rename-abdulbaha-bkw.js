#!/usr/bin/env node
/**
 * Rename Abdul-Baha Best-Known-Works files from ocean IDs to title-based names.
 * Before: abdul-baha-bkw02-ar.md
 * After:  Alváḥ-i-Tablíghí-i-Imríká-ar.md
 *
 * Usage: node scripts/rename-abdulbaha-bkw.js [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const DIR = path.resolve('data/Best-Known-Works/Abdul-Baha');
const DRY_RUN = process.argv.includes('--dry-run');

function titleToFilename(title, lang) {
  // Replace spaces/underscores with hyphens, collapse multiples, trim edges
  const slug = title
    .replace(/[''ʼ`'\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF'-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${lang}.md`;
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
let renamed = 0;

for (const file of files) {
  const filePath = path.join(DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data } = matter(raw);

  if (!data.title || !data.language) {
    console.log(`  skip ${file} — missing title or language`);
    continue;
  }

  const newName = titleToFilename(data.title, data.language);
  if (newName === file) {
    console.log(`  unchanged ${file}`);
    continue;
  }

  const newPath = path.join(DIR, newName);
  if (fs.existsSync(newPath) && newPath !== filePath) {
    console.log(`  CONFLICT ${file} → ${newName} (target exists)`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`  would rename ${file} → ${newName}`);
  } else {
    fs.renameSync(filePath, newPath);
    console.log(`  ✓ ${file} → ${newName}`);
  }
  renamed++;
}

console.log(`\n${DRY_RUN ? 'Would rename' : 'Renamed'} ${renamed} files`);
