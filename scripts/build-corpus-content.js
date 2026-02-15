#!/usr/bin/env node
/**
 * Generate Astro content collection files for the SE translation corpus.
 * Input: tmp/phrases.json, tmp/corpus-meta.json
 * Output: src/content/corpus/{work-slug}/_meta.json + {para}.json per paragraph
 */
import fs from 'node:fs';
import path from 'node:path';

const PHRASES_PATH = path.resolve('tmp/phrases.json');
const META_PATH = path.resolve('tmp/corpus-meta.json');
const OUT_DIR = path.resolve('src/content/corpus');

function main() {
  const phrases = JSON.parse(fs.readFileSync(PHRASES_PATH, 'utf-8'));
  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf-8'));

  // Group phrases by slug
  const bySlug = new Map();
  for (const p of phrases) {
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
    bySlug.get(p.slug).push(p);
  }

  let totalFiles = 0;

  for (const [slug, pairs] of bySlug) {
    const workDir = path.join(OUT_DIR, slug);
    fs.mkdirSync(workDir, { recursive: true });

    // Write _meta.json
    const workMeta = meta.find(m => m.slug === slug) || {};
    fs.writeFileSync(
      path.join(workDir, '_meta.json'),
      JSON.stringify(
        {
          title: workMeta.title || pairs[0]?.work || slug,
          author: workMeta.author || pairs[0]?.author || '',
          source_lang: workMeta.source_lang || pairs[0]?.source_lang || 'ar',
          source_url: workMeta.source_url || null,
          pair_count: pairs.length,
          slug,
        },
        null,
        2,
      ),
    );

    // Write per-paragraph JSON
    for (const pair of pairs) {
      const entry = {
        work: pair.work,
        slug: pair.slug,
        author: pair.author,
        pair_index: pair.pair_index,
        source_text: pair.source_text,
        translation: pair.translation,
        source_lang: pair.source_lang,
        score: pair.score,
        // terms and cross_refs will be populated by build-annotations.js later
      };

      fs.writeFileSync(
        path.join(workDir, `${pair.pair_index}.json`),
        JSON.stringify(entry, null, 2),
      );
      totalFiles++;
    }
  }

  console.log(`Generated ${totalFiles} paragraph files across ${bySlug.size} works`);
}

main();
