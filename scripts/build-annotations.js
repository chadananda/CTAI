#!/usr/bin/env node
/**
 * Enrich corpus paragraph JSON files with Jafar concordance data + AI analysis.
 *
 * Uses the shared analyzePhrase() from concordance.js (filtered, validated lookups).
 *
 * Usage:
 *   node scripts/build-annotations.js --work tablet-of-the-holy-mariner --para 1
 *   node scripts/build-annotations.js --work tablet-of-the-holy-mariner   # all paragraphs
 *   node scripts/build-annotations.js                                      # everything
 *   node scripts/build-annotations.js --force                              # re-process all (ignore existing)
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { analyzePhrase } from '../src/lib/concordance.js';

// Load .env file
const CWD = process.cwd();
const envPath = path.join(CWD, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^(\w+)=["']?(.+?)["']?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
const CORPUS_DIR = path.join(CWD, 'src/content/corpus');
const DB_PATH = path.join(CWD, 'data/jafar.db');

// Normalization — only needed for matching AI output to Jafar terms
function normalize(token) {
  let t = token
    .replace(/[.*,:;\?\!\(\)\[\]\{\}«»\u060C\u061B\u061F\u06D4…\u200C\u200D\u200E\u200F﴿﴾]/g, '');
  t = t.replace(/[\u064B-\u065F\u0670]/g, '');
  t = t.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی').replace(/ٱ/g, 'ا').replace(/آ/g, 'ا')
    .replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ی');
  return t;
}

// ── AI Analysis ──

async function aiAnalyze(client, sourceText, translation, jafarTerms, sourceLang) {
  // Cap to top 25 roots by occurrence count to keep prompt size manageable
  const topTerms = [...jafarTerms].sort((a, b) => b.rows.length - a.rows.length).slice(0, 25);
  const termSummary = topTerms.map(t => {
    const renderings = [...new Set(t.rows.map(r => r.en))].slice(0, 6);
    return `- ${t.word} (root: ${t.root}, ${t.transliteration}): "${t.meaning}" — SE renderings: ${renderings.map(r => `"${r}"`).join(', ')} (${t.rows.length} occ)`;
  }).join('\n');

  const prompt = `You are analyzing a paragraph from a Baha'i sacred text translated by Shoghi Effendi (SE).

SOURCE (${sourceLang === 'ar' ? 'Arabic' : 'Persian'}):
${sourceText}

TRANSLATION (English by Shoghi Effendi):
${translation}

JAFAR CONCORDANCE DATA (roots found in this paragraph with all their SE renderings across the corpus):
${termSummary}

Produce a JSON object with these fields:

1. "page_slug": A URL-safe English slug (3-6 words, lowercase, hyphens) from the most memorable phrase in the translation. No stop words at start.

2. "alignment": Array of {ar, en} pairs mapping Arabic/Persian phrases to their English translations. Cover the FULL text. Each pair should be a meaningful phrase (2-6 words), not single words. Order matches the source text order.

3. "interesting_terms": Array of 5-8 Arabic/Persian terms from the source that are most translation-noteworthy (not stop words, not trivial). Use the EXACT forms as they appear in the source text (with diacritics/tashkil as written).

4. "term_renderings": Object mapping each interesting term to the EXACT English word(s) SE used to translate it IN THIS SPECIFIC PASSAGE. For example, if العزيز appears in "He is the Gracious" then its rendering here is "the Gracious".

5. "term_notes": Object mapping EVERY interesting term to a CONCISE scholarly note (max 25 words). Rules for good notes:
   - State the TYPICAL rendering pattern first, then the DEVIATION in this passage
   - Reference specific alternative renderings from the Jafar data by name
   - Be specific and factual, never vague ("emphasizing", "aligns with", "spectrum of")
   - NEVER restate what the reader can already see (don't say "translated as X here" when X is already displayed)
   - Focus on WHY this rendering choice matters or what it reveals about SE's method

   GOOD example: "Usually 'glory' or 'might' across 70 occurrences. 'Gracious' appears only here — a uniquely tender choice."
   BAD example: "Translated as 'Gracious' here, emphasizing the gracious nature; this rendering aligns with SE's spectrum of terms."

   Every term MUST have a note — no empty values.

Return ONLY valid JSON, no markdown fences.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text.trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      return JSON.parse(cleaned);
    } catch (err) {
      if (attempt < 2) {
        console.warn(`  Retry ${attempt + 1}/3: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}

// ── Merge & Write ──

function findNoteForTerm(aiNotes, word) {
  if (aiNotes[word]) return aiNotes[word];
  const normWord = normalize(word);
  for (const [key, val] of Object.entries(aiNotes)) {
    if (normalize(key) === normWord) return val;
  }
  return '';
}

function findSeRendering(word, alignment, translation) {
  const normWord = normalize(word);
  for (const pair of (alignment || [])) {
    if (normalize(pair.ar).includes(normWord)) {
      return pair.en;
    }
  }
  return '';
}

function buildTermEntry(jafarTerm, aiNotes, aiInteresting, aiRenderings, currentSlug, alignment, translation) {
  const isInteresting = aiInteresting.some(t => normalize(t) === normalize(jafarTerm.word));
  if (!isInteresting) return null;

  const originalForm = aiInteresting.find(t => normalize(t) === normalize(jafarTerm.word)) || jafarTerm.word;

  // Build cross_refs from Jafar rows (already filtered/validated by concordance.js)
  const crossRefs = [];
  const seenRefs = new Set();
  for (const row of jafarTerm.rows) {
    // Parse ref format: "GWB 185" or "P&M 447"
    const refMatch = row.ref?.match(/^(.+?)\s+(\d+)$/);
    if (!refMatch) continue;

    // Map abbreviation back to slug
    const slug = abbrToSlug(refMatch[1]);
    if (!slug || slug === currentSlug) continue;
    const paraIdx = refMatch[2];
    const refKey = `${slug}-${paraIdx}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);
    crossRefs.push({
      work: slug,
      para: parseInt(paraIdx) || paraIdx,
      snippet: row.en,
    });
  }

  // Pick diverse cross_refs (different renderings)
  const diverseRefs = [];
  const seenSnippets = new Set();
  for (const ref of crossRefs) {
    const snipKey = (ref.snippet || '').toLowerCase();
    if (!seenSnippets.has(snipKey)) {
      seenSnippets.add(snipKey);
      diverseRefs.push(ref);
    }
    if (diverseRefs.length >= 8) break;
  }

  // SE rendering: prefer AI term_renderings, then alignment match, then first Jafar row
  const aiRendering = findNoteForTerm(aiRenderings || {}, jafarTerm.word) || findNoteForTerm(aiRenderings || {}, originalForm);
  const alignRendering = findSeRendering(jafarTerm.word, alignment, translation);
  const seRendering = aiRendering || alignRendering || jafarTerm.rows[0]?.en || '';

  return {
    term: originalForm,
    transliteration: jafarTerm.transliteration,
    literal: jafarTerm.meaning,
    se_rendering: seRendering,
    note: findNoteForTerm(aiNotes, jafarTerm.word) || findNoteForTerm(aiNotes, originalForm),
    cross_refs: diverseRefs,
  };
}

// Map abbreviations back to corpus slugs
const ABBR_TO_SLUG = {
  'W&T': 'will-and-testament',
  'ESW': 'epistle-to-the-son-of-the-wolf',
  'Fire': 'fire-tablet',
  'GWB': 'gleanings',
  'Ahd': 'kitab-i-ahd',
  'KIQ': 'kitab-i-iqan',
  'Departed': 'prayers-and-meditations',
  'P&M': 'prayers-and-meditations',
  'Ahmad': 'tablet-of-ahmad',
  'Carmel': 'tablet-of-carmel',
  'Mariner': 'tablet-of-the-holy-mariner',
  'HW': 'the-hidden-words',
};

function abbrToSlug(abbr) {
  return ABBR_TO_SLUG[abbr] || abbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function mergeAnnotations(paragraph, jafarTerms, aiResult) {
  paragraph.page_slug = aiResult.page_slug;
  paragraph.alignment = aiResult.alignment;

  const terms = [];
  for (const jt of jafarTerms) {
    const entry = buildTermEntry(jt, aiResult.term_notes || {}, aiResult.interesting_terms || [], aiResult.term_renderings || {}, paragraph.slug, aiResult.alignment, paragraph.translation);
    if (entry) terms.push(entry);
  }

  // Also check if AI picked terms we missed
  const coveredNorms = new Set(terms.map(t => normalize(t.term)));
  for (const interestingTerm of (aiResult.interesting_terms || [])) {
    if (coveredNorms.has(normalize(interestingTerm))) continue;
    const jt = jafarTerms.find(j => normalize(j.word) === normalize(interestingTerm));
    if (jt) {
      const entry = buildTermEntry(jt, aiResult.term_notes || {}, [interestingTerm], aiResult.term_renderings || {}, paragraph.slug, aiResult.alignment, paragraph.translation);
      if (entry) terms.push(entry);
    }
  }

  paragraph.terms = terms;
  return paragraph;
}

// ── Main ──

async function processOne(client, workSlug, paraIndex, { force = false } = {}) {
  const filePath = path.join(CORPUS_DIR, workSlug, `${paraIndex}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  const paragraph = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Skip if already annotated (has terms with notes) unless --force
  if (!force && paragraph.terms?.length > 0 && paragraph.alignment?.length > 0) {
    return 'skipped';
  }

  console.log(`\n── ${paragraph.work} §${paraIndex} ──`);
  console.log(`Source: ${paragraph.source_text.slice(0, 80)}...`);

  // Step 1: Jafar lookup (uses concordance.js — filtered, validated)
  console.log('  Step 1: Jafar concordance lookup...');
  const { terms: jafarTerms } = await analyzePhrase(paragraph.source_text, paragraph.source_lang);
  console.log(`  Found ${jafarTerms.length} roots: ${jafarTerms.map(t => t.root).join(', ')}`);
  console.log(`  Total filtered rows: ${jafarTerms.reduce((s, t) => s + t.rows.length, 0)}`);

  // Step 2: AI analysis
  console.log('  Step 2: AI analysis (Haiku)...');
  const aiResult = await aiAnalyze(client, paragraph.source_text, paragraph.translation, jafarTerms, paragraph.source_lang);
  console.log(`  Slug: ${aiResult.page_slug}`);
  console.log(`  Alignment pairs: ${aiResult.alignment?.length || 0}`);
  console.log(`  Interesting terms: ${aiResult.interesting_terms?.join(', ') || 'none'}`);

  // Step 3: Merge & write
  console.log('  Step 3: Merging annotations...');
  const enriched = mergeAnnotations(paragraph, jafarTerms, aiResult);
  console.log(`  Terms with notes: ${enriched.terms.length}`);

  fs.writeFileSync(filePath, JSON.stringify(enriched, null, 2));
  console.log(`  Written: ${filePath}`);

  return enriched;
}

async function main() {
  const args = process.argv.slice(2);
  const workFlag = args.indexOf('--work');
  const paraFlag = args.indexOf('--para');
  const force = args.includes('--force');
  const workSlug = workFlag !== -1 ? args[workFlag + 1] : null;
  const paraIndex = paraFlag !== -1 ? parseInt(args[paraFlag + 1]) : null;

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Jafar database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const client = new Anthropic();
  let processed = 0, skipped = 0, failed = 0;

  async function processWith(slug, idx) {
    try {
      const result = await processOne(client, slug, idx, { force });
      if (result === 'skipped') { skipped++; }
      else { processed++; }
    } catch (err) {
      failed++;
      console.error(`  FAILED ${slug} §${idx}: ${err.message}`);
    }
  }

  if (workSlug && paraIndex) {
    await processWith(workSlug, paraIndex);
  } else if (workSlug) {
    const workDir = path.join(CORPUS_DIR, workSlug);
    const files = fs.readdirSync(workDir).filter(f => f !== '_meta.json' && f.endsWith('.json'));
    console.log(`Processing ${files.length} paragraphs in ${workSlug}...`);
    for (const file of files.sort((a, b) => parseInt(a) - parseInt(b))) {
      const idx = parseInt(path.basename(file, '.json'));
      await processWith(workSlug, idx);
    }
  } else {
    const slugs = fs.readdirSync(CORPUS_DIR).filter(d =>
      fs.statSync(path.join(CORPUS_DIR, d)).isDirectory()
    );
    for (const slug of slugs) {
      const workDir = path.join(CORPUS_DIR, slug);
      const files = fs.readdirSync(workDir).filter(f => f !== '_meta.json' && f.endsWith('.json'));
      console.log(`\nWork: ${slug} (${files.length} paragraphs)`);
      for (const file of files.sort((a, b) => parseInt(a) - parseInt(b))) {
        const idx = parseInt(path.basename(file, '.json'));
        await processWith(slug, idx);
      }
    }
  }

  console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
