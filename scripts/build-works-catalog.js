#!/usr/bin/env node
/**
 * Parse Best-Known-Works frontmatter into Astro content collection JSON.
 * Input: data/Best-Known-Works/{author}/*.md
 * Output: src/content/works/{author-slug}/{doc-id}.json
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const DATA_DIR = path.resolve('data/Best-Known-Works');
const OUT_DIR = path.resolve('src/content/works');
const SE_DIR = path.resolve('data/shoghi-effendi-translations');

const AUTHOR_SLUGS = {
  "Baha'u'llah": 'bahaullah',
  'The Bab': 'the-bab',
  "Abdu'l-Baha": 'abdul-baha',
  'Shoghi Effendi': 'shoghi-effendi',
};

function authorSlug(author) {
  return AUTHOR_SLUGS[author] || author.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function docIdFromFilename(filename) {
  return filename
    .replace(/\.md$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Get titles of works translated by Shoghi Effendi */
function getSETranslationTitles() {
  const titles = new Set();
  const files = fs.readdirSync(SE_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
  for (const file of files) {
    const raw = fs.readFileSync(path.join(SE_DIR, file), 'utf-8');
    const { data } = matter(raw);
    if (data.title) titles.add(data.title.toLowerCase());
  }
  return titles;
}

function main() {
  const seTitles = getSETranslationTitles();

  const authorDirs = fs.readdirSync(DATA_DIR).filter(d => {
    return fs.statSync(path.join(DATA_DIR, d)).isDirectory();
  });

  let total = 0;

  for (const authorDir of authorDirs) {
    const aSlug = authorSlug(authorDir);
    const outPath = path.join(OUT_DIR, aSlug);
    fs.mkdirSync(outPath, { recursive: true });

    const dirPath = path.join(DATA_DIR, authorDir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(raw);
      const docId = docIdFromFilename(file);

      const workTitle = (data.title || '').toLowerCase();
      // Check if any SE translation title is a substring match
      const hasSeTranslation = [...seTitles].some(
        t => workTitle.includes(t) || t.includes(workTitle)
      );

      const entry = {
        title: data.title || file.replace('.md', ''),
        title_original: data.title_original || null,
        author: data.author || authorDir,
        author_slug: aSlug,
        language: data.language || 'ar',
        source_url: data.source_url || null,
        ocean_id: data.ocean_id || null,
        has_english_translation: data.has_english_translation || false,
        english_url: data.english_url || null,
        se_translation: hasSeTranslation,
        doc_id: docId,
      };

      fs.writeFileSync(path.join(outPath, `${docId}.json`), JSON.stringify(entry, null, 2));
      total++;
    }
  }

  console.log(`Wrote ${total} work entries to ${OUT_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file://', ''))) {
  main();
}

export { main };
