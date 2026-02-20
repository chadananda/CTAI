#!/usr/bin/env node
/**
 * Strip parenthetical English from titles where title_english already has the translation.
 * e.g. "Kitábu'r-Rúḥ (Book of Spirit)" → "Kitábu'r-Rúḥ"
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const WORKS_DIR = resolve('src/content/works');

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walkDir(full));
    else if (entry.endsWith('.json')) files.push(full);
  }
  return files;
}

let fixed = 0;
for (const filePath of walkDir(WORKS_DIR)) {
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  if (!data.title || !data.title.includes('(')) continue;

  const match = data.title.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (!match) continue;

  const translit = match[1].trim();
  const paren = match[2].trim();

  // Only strip if we have title_english covering this
  if (!data.title_english) continue;

  // Keep transliterated parentheticals (contain diacritics or i-connectors typical of transliteration)
  // Strip English ones
  const hasTranslit = /['-]i-/.test(paren) && !/^(Commentary|Epistle|Book|Tablet|Seven|Golden|Visitation|Collected|Corrected|Extracts)/.test(paren);
  if (hasTranslit) {
    console.log(`Kept:  ${data.doc_id} (paren is transliterated: "${paren}")`);
    continue;
  }

  data.title = translit;
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  fixed++;
  console.log(`Fixed: ${data.doc_id} → "${translit}"`);
}

console.log(`\nStripped parentheticals from ${fixed} titles.`);
