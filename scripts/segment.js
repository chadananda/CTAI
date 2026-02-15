#!/usr/bin/env node
/**
 * Segment Best-Known-Works markdown files into chunks for Meilisearch.
 * Input: data/Best-Known-Works/{author}/*.md
 * Output: tmp/concepts.json
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const DATA_DIR = path.resolve('data/Best-Known-Works');
const OUT_DIR = path.resolve('tmp');

const AUTHOR_SLUGS = {
  "Baha'u'llah": 'bahaullah',
  'The Bab': 'the-bab',
  "Abdu'l-Baha": 'abdul-baha',
  'Shoghi Effendi': 'shoghi-effendi',
};

const MAX_CHUNK = 1000;
const TARGET_CHUNK = 500;

export function authorSlug(author) {
  return AUTHOR_SLUGS[author] || author.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function docIdFromFilename(filename) {
  return filename
    .replace(/\.md$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Split text into paragraphs at double-newlines or numbered markers */
export function splitIntoParagraphs(text) {
  // Split on numbered Arabic paragraph markers (١, ٢, etc at start of line)
  // or double newlines
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  return paragraphs.map(p => p.trim());
}

/** Chunk paragraphs into segments respecting max size */
export function chunkParagraphs(paragraphs, target = TARGET_CHUNK, max = MAX_CHUNK) {
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > max) {
      // Flush current
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      // Split oversized paragraph by sentences (period + space)
      let remaining = para;
      while (remaining.length > max) {
        let splitAt = remaining.lastIndexOf(' ', max);
        if (splitAt < target / 2) splitAt = max;
        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
      }
      if (remaining) current = remaining;
      continue;
    }

    if (current.length + para.length + 2 > target && current.trim()) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function processFile(filePath, authorDir) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);
  const filename = path.basename(filePath);
  const docId = docIdFromFilename(filename);
  const aSlug = authorSlug(authorDir);
  const lang = frontmatter.language || (filename.endsWith('-ar.md') ? 'ar' : 'fa');

  const paragraphs = splitIntoParagraphs(content);
  const chunks = chunkParagraphs(paragraphs);

  return chunks.map((text, i) => ({
    id: `${docId}-chunk-${i + 1}`,
    work: frontmatter.title || filename.replace('.md', ''),
    author: frontmatter.author || authorDir,
    text,
    language: lang,
    chunk_index: i + 1,
    doc_id: docId,
    url: `/works/${aSlug}/${docId}`,
  }));
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allChunks = [];
  const authorDirs = fs.readdirSync(DATA_DIR).filter(d => {
    const stat = fs.statSync(path.join(DATA_DIR, d));
    return stat.isDirectory();
  });

  for (const authorDir of authorDirs) {
    const dirPath = path.join(DATA_DIR, authorDir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const chunks = processFile(filePath, authorDir);
      allChunks.push(...chunks);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'concepts.json'), JSON.stringify(allChunks, null, 2));
  console.log(`Total chunks: ${allChunks.length}`);
  console.log(`From ${authorDirs.length} authors`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file://', ''))) {
  main();
}

export { main };
