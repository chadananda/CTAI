#!/usr/bin/env node
/**
 * Parse Best-Known-Works + Scholarly-Works frontmatter into Astro content collection JSON.
 * Input: data/Best-Known-Works/{author}/*.md + data/Scholarly-Works/ (recursive)
 * Output: src/content/works/{author-slug}/{doc-id}.json
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const SACRED_DIR = path.resolve('data/Best-Known-Works');
const SCHOLARLY_DIR = path.resolve('data/Scholarly-Works');
const OUT_DIR = path.resolve('src/content/works');
const SE_DIR = path.resolve('data/shoghi-effendi-translations');

const AUTHOR_SLUGS = {
  "Baha'u'llah": 'bahaullah',
  'The Bab': 'the-bab',
  "Abdu'l-Baha": 'abdul-baha',
  'Shoghi Effendi': 'shoghi-effendi',
  'Dr. Ali-Murad Davudi': 'davudi',
  'Mirza Asad\'ullah Fadil Mazindarani': 'mazindarani',
  'Hasan Fu\'adi Bushrui': 'bushrui',
  'Aziz\'ullah Sulaymani Ardakani': 'sulaymani',
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
/** Extract first ~500 chars of body text for preview */
function extractSourcePreview(body) {
  const lines = body.split('\n')
    .filter(l => !l.startsWith('#'))
    .filter(l => !/^\d+\s+words/.test(l.trim()))
    .map(l => l.trim())
    .filter(l => l.length > 0);
  const text = lines.join(' ');
  return text.slice(0, 500);
}
/** Parse word count from body or count words as fallback */
function extractWordCount(body) {
  const match = body.match(/^(\d+)\s+words/m);
  if (match) return parseInt(match[1], 10);
  return body.split(/\s+/).filter(w => w.length > 0).length;
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

/** Recursively find all .md files in a directory */
function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md' && !entry.name.includes('index')) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const seTitles = getSETranslationTitles();
  let total = 0;

  // --- Sacred works (Best-Known-Works) ---
  const authorDirs = fs.readdirSync(SACRED_DIR).filter(d => {
    return fs.statSync(path.join(SACRED_DIR, d)).isDirectory();
  });

  for (const authorDir of authorDirs) {
    const aSlug = authorSlug(authorDir);
    const outPath = path.join(OUT_DIR, aSlug);
    fs.mkdirSync(outPath, { recursive: true });

    const dirPath = path.join(SACRED_DIR, authorDir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content: bodyContent } = matter(raw);
      const docId = docIdFromFilename(file);

      const workTitle = (data.title || '').toLowerCase();
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
        source_preview: extractSourcePreview(bodyContent),
        word_count: extractWordCount(bodyContent),
        category: 'sacred',
        translation_style: 'archaic',
      };

      fs.writeFileSync(path.join(outPath, `${docId}.json`), JSON.stringify(entry, null, 2));
      total++;
    }
  }

  // --- Scholarly works ---
  const scholarlyFiles = findMarkdownFiles(SCHOLARLY_DIR);
  for (const filePath of scholarlyFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content: bodyContent } = matter(raw);
    const file = path.basename(filePath);
    // Build doc_id as: {author-slug}-{title-slug}[-v{N}]
    const author = data.author || path.basename(path.dirname(filePath));
    const titleSlug = docIdFromFilename(data.title || file);
    const docId = titleSlug.startsWith(authorSlug(author))
      ? titleSlug  // already contains author name (e.g. maqalat-davudi-v1)
      : `${authorSlug(author)}-${titleSlug}`;
    const aSlug = authorSlug(author);
    const outPath = path.join(OUT_DIR, aSlug);
    fs.mkdirSync(outPath, { recursive: true });

    const entry = {
      title: data.title || file.replace('.md', ''),
      title_original: data.title_original || null,
      author,
      author_slug: aSlug,
      language: data.language || 'fa',
      source_url: data.source_url || null,
      ocean_id: null,
      has_english_translation: false,
      english_url: null,
      se_translation: false,
      doc_id: docId,
      source_preview: extractSourcePreview(bodyContent),
      word_count: extractWordCount(bodyContent),
      category: 'scholarly',
      translation_style: 'modern',
      subject: data.subject || null,
      author_original: data.author_original || null,
      volume: data.volume || null,
      volumes_total: data.volumes_total || null,
      date_composed: data.date_composed ? String(data.date_composed) : null,
      source_format: data.source_format || null,
    };

    fs.writeFileSync(path.join(outPath, `${docId}.json`), JSON.stringify(entry, null, 2));
    total++;
  }

  console.log(`Wrote ${total} work entries to ${OUT_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file://', ''))) {
  main();
}

export { main };
