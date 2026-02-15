#!/usr/bin/env node
/**
 * Parse Shoghi Effendi translation files into structured paragraph JSON.
 * Input: data/shoghi-effendi-translations/*.md
 * Output: tmp/phrases.json, tmp/corpus-meta.json
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const DATA_DIR = path.resolve('data/shoghi-effendi-translations');
const OUT_DIR = path.resolve('tmp');

/** Convert title to URL-safe slug */
export function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[''ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Parse a single SE translation file into paragraph pairs */
export function parseFile(content, fileMeta) {
  const lines = content.split('\n');
  const pairs = [];
  let currentHeader = null;
  let sourceLines = [];
  let transLines = [];
  let inTranslation = false;

  function flushPair() {
    if (!currentHeader) return;
    const source = sourceLines.join('\n').trim();
    const translation = transLines.join('\n').trim();
    if (source || translation) {
      pairs.push({
        header: currentHeader,
        source_text: source,
        translation: translation,
      });
    }
    sourceLines = [];
    transLines = [];
    inTranslation = false;
    currentHeader = null;
  }

  for (const line of lines) {
    const headerMatch = line.match(/^\[(.+?),\s*(.+?),\s*([\d.]+)\]\s*$/);
    if (headerMatch) {
      flushPair();
      currentHeader = {
        work: headerMatch[1],
        index: headerMatch[2].trim(),
        score: parseFloat(headerMatch[3]),
      };
      continue;
    }

    if (line.match(/^={3,}$/)) {
      inTranslation = true;
      continue;
    }

    if (currentHeader) {
      if (inTranslation) {
        transLines.push(line);
      } else {
        sourceLines.push(line);
      }
    }
  }
  flushPair();

  return pairs;
}

/** Merge section headers (short addressing lines) with the content that follows */
export function mergePairs(pairs) {
  const merged = [];
  let pendingHeader = null;

  for (const pair of pairs) {
    const isShortHeader =
      pair.source_text.length < 80 &&
      pair.translation.length < 80 &&
      (pair.source_text.match(/﴿.*﴾/) || pair.translation.match(/^[\(\d\)]*\s*O\s/i));

    if (isShortHeader && !pendingHeader) {
      pendingHeader = pair;
      continue;
    }

    if (pendingHeader) {
      merged.push({
        header: pendingHeader.header,
        source_text: pendingHeader.source_text + '\n' + pair.source_text,
        translation: pendingHeader.translation + '\n' + pair.translation,
      });
      pendingHeader = null;
    } else {
      merged.push(pair);
    }
  }

  // Don't lose a trailing header
  if (pendingHeader) merged.push(pendingHeader);
  return merged;
}

/** Build final document objects from merged pairs */
export function buildDocuments(mergedPairs, fileMeta) {
  const slug = slugify(fileMeta.title);
  const docs = [];

  for (let i = 0; i < mergedPairs.length; i++) {
    const pair = mergedPairs[i];
    const pairIndex = i + 1;
    docs.push({
      id: `${slug}-${pairIndex}`,
      work: fileMeta.title,
      slug,
      author: fileMeta.author,
      source_text: pair.source_text,
      translation: pair.translation,
      full_text: `${pair.source_text}\n${pair.translation}`,
      source_lang: fileMeta.source_language?.split('/')[0] || 'ar',
      pair_index: pairIndex,
      score: pair.header.score,
      url: `/corpus/${slug}/${pairIndex}`,
    });
  }

  return docs;
}

export function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);
  const rawPairs = parseFile(content, frontmatter);
  const merged = mergePairs(rawPairs);
  return { meta: frontmatter, docs: buildDocuments(merged, frontmatter) };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
  const allDocs = [];
  const corpusMeta = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    console.log(`Parsing: ${file}`);
    const { meta, docs } = processFile(filePath);
    allDocs.push(...docs);
    const slug = slugify(meta.title);
    corpusMeta.push({
      title: meta.title,
      author: meta.author,
      source_lang: meta.source_language?.split('/')[0] || 'ar',
      source_url: meta.source_url || null,
      pair_count: docs.length,
      slug,
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, 'phrases.json'), JSON.stringify(allDocs, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'corpus-meta.json'), JSON.stringify(corpusMeta, null, 2));

  console.log(`\nTotal pairs: ${allDocs.length}`);
  console.log(`Works: ${corpusMeta.length}`);
  for (const w of corpusMeta) {
    console.log(`  ${w.title}: ${w.pair_count} pairs`);
  }
}

// Run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file://', ''))) {
  main();
}

export { main };
