#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { MeiliSearch } from 'meilisearch';

const CWD = process.cwd();
const PHRASES_PATH = join(CWD, 'tmp/phrases.json');
const CHECKPOINT_PATH = join(CWD, 'tmp/jafar-build-progress.json');
const DB_PATH = join(CWD, 'data/jafar.db');
const BATCH_SIZE = 8;
const CONCURRENT_BATCHES = 8;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 1000;

const ABBR = {
  'Will and Testament': 'W&T',
  'Epistle to the Son of the Wolf': 'ESW',
  'Fire Tablet': 'Fire',
  'Gleanings': 'GWB',
  "Kitab-i-'Ahd": 'Ahd',
  'Kitab-i-Iqan': 'KIQ',
  'Prayer for the Dead': 'Departed',
  'Prayers and Meditations': 'P&M',
  'Tablet of Ahmad': 'Ahmad',
  'Tablet of Carmel': 'Carmel',
  'Tablet of the Holy Mariner': 'Mariner',
  'The Hidden Words': 'HW',
  'Hidden Words': 'HW',
  'Kitáb-i-Íqán': 'KIQ',
};

// Stop words — written naturally, normalized at runtime via cleanToken()
const _STOP_RAW = [
  // Arabic particles, prepositions, conjunctions
  'و', 'في', 'من', 'على', 'علی', 'إلى', 'إلی', 'الی', 'عن', 'أن', 'إنّ', 'إن', 'ان',
  'لا', 'لم', 'لن', 'قد', 'بل', 'ثمّ', 'ثم', 'أو', 'أم', 'ما', 'إلا', 'الا',
  'فإن', 'بأن', 'لأن', 'كأن', 'وإن', 'ولا', 'وما', 'بما', 'عما', 'فما', 'لما', 'مما',
  'حتّى', 'حتی', 'مع', 'عند', 'بعد', 'قبل', 'فوق', 'تحت', 'بين', 'بین', 'خلال', 'حول', 'منذ',
  'نحو', 'ضدّ', 'سوى', 'سوی', 'يا', 'أيّها', 'أي',
  // Arabic pronouns and demonstratives
  'هو', 'هي', 'هم', 'هن', 'أنت', 'أنتم', 'أنا', 'نحن',
  'ذلك', 'ذلک', 'هذا', 'هذه', 'تلك', 'تلک', 'ذا', 'هؤلاء',
  // Arabic relative pronouns (with and without shaddah)
  'الّذي', 'الذي', 'الذی', 'الّتي', 'التي', 'التی', 'الّذين', 'الذين', 'الذین',
  'اللّاتي', 'اللاتي', 'اللذين', 'اللتين', 'اللواتي',
  // Arabic verbs (copula/auxiliary)
  'كان', 'کان', 'كنت', 'کنت', 'كانت', 'کانت', 'يكون', 'تكون',
  // Arabic quantifiers
  'كلّ', 'کل', 'بعض', 'بعضی', 'غير', 'مثل', 'جميع', 'جمیع',
  // Arabic pronominal clitics as standalone
  'له', 'لها', 'لهم', 'لمن', 'فيه', 'فيها', 'منه', 'منها', 'به', 'بها',
  'عنه', 'عنها', 'عليه', 'علیها', 'إليك', 'إليه',
  // Arabic sentence particles
  'إنك', 'إنّك', 'إنه', 'إنّه', 'وإنك', 'وإنّك', 'انه', 'کذلک',
  // Single-letter particles
  'ف', 'ب', 'ل', 'ک', 'ك',
  // Arabic compound particles
  'لل', 'وال', 'فال', 'بال', 'کال',
  // Persian particles, prepositions, conjunctions
  'است', 'در', 'با', 'را', 'این', 'اين', 'آن', 'که', 'تا', 'اگر',
  'چه', 'هر', 'یا', 'نه', 'برای', 'براي', 'چون', 'چنانچه', 'همچنين', 'همچنین',
  'آنکه', 'آنچه', 'انچه', 'همه',
  // Persian pronouns
  'خود', 'شما', 'ايشان', 'ایشان',
  // Persian auxiliary/copula verbs
  'شد', 'شده', 'شود', 'شوند',
  'بود', 'بوده',
  'گشت', 'گشته', 'گردد', 'گردید', 'گرديد',
  'نمود', 'نمودند', 'نموده', 'نمايد', 'نماید', 'نمايند', 'نمایند',
  // Persian other
  'ديگر', 'دیگر', 'باری', 'حال',
  'إذ', 'إذا',
];

// Strip punctuation and normalize Arabic/Persian character variants
function cleanToken(token) {
  let t = token
    .replace(/[.*,:;\?\!\(\)\[\]\{\}«»\u060C\u061B\u061F\u06D4…\u200C\u200D\u200E\u200F]/g, '');
  t = t.replace(/[\u064B-\u065F\u0670]/g, ''); // strip tashkil
  t = t.replace(/ي/g, 'ی')   // Arabic ya → Persian ya
    .replace(/ك/g, 'ک')      // Arabic kaf → Persian kaf
    .replace(/ؤ/g, 'و')      // hamza on waw → waw
    .replace(/ئ/g, 'ی')      // hamza on ya → ya
    .replace(/ٱ/g, 'ا')      // alef wasla → plain alef
    .replace(/آ/g, 'ا')      // alef madda → plain alef
    .replace(/أ/g, 'ا')      // hamza above alef → plain alef
    .replace(/إ/g, 'ا')      // hamza below alef → plain alef
    .replace(/ة/g, 'ه')      // taa marbuta → ha
    .replace(/ى/g, 'ی');     // alef maqsura → ya
  return t;
}

// Build normalized stop word set
const STOP_WORDS = new Set(_STOP_RAW.map(cleanToken));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const meili = new MeiliSearch({
  host: process.env.MEILI_URL || 'http://localhost:7700',
  apiKey: process.env.MEILI_API_KEY || '',
});

function isContentWord(word) {
  return word.length > 2 && !STOP_WORDS.has(word);
}

async function checkMeilisearchPopulated() {
  console.log('Checking Meilisearch index...');
  const index = meili.index('phrases');
  const stats = await index.getStats();
  if (stats.numberOfDocuments === 0) {
    throw new Error('Meilisearch phrases index is empty. Run `npm run index` first.');
  }
  console.log(`✓ Meilisearch has ${stats.numberOfDocuments} documents`);
}

function extractUniqueWords(phrases) {
  console.log('Extracting unique content words...');
  const wordMap = new Map();
  for (const pair of phrases) {
    const tokens = pair.source_text.split(/\s+/);
    for (const token of tokens) {
      const cleaned = cleanToken(token);
      if (!isContentWord(cleaned)) continue;
      if (!wordMap.has(cleaned)) {
        wordMap.set(cleaned, []);
      }
      wordMap.get(cleaned).push(pair.id);
    }
  }
  console.log(`✓ Found ${wordMap.size} unique content words`);
  return wordMap;
}

async function searchMeiliForWord(word, limit = 10) {
  const index = meili.index('phrases');
  const results = await index.search(word, { limit });
  return results.hits;
}

function fixArabicTranslitJSON(text) {
  // Fix single-quote issues in transliteration values (e.g., "sh-r-' → "sh-r-ʿ")
  // Pattern: a single quote before a comma/closing-quote that breaks JSON
  return text
    .replace(/': "/g, 'ʿ": "')           // key ending with ' before ": "
    .replace(/"([^"]*?)'/g, (m, g1) => {  // value ending with ' before next "
      // Only fix if it looks like a transliteration (has hyphens)
      return g1.includes('-') ? `"${g1}ʿ` : m;
    })
    .replace(/,\s*([}\]])/g, '$1');       // trailing commas
}

function extractJSON(text) {
  // Strip markdown fences
  let cleaned = text.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '').trim();
  // Try parsing as-is
  try { return JSON.parse(cleaned); } catch {}
  // Find the outermost { ... } block
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const block = cleaned.slice(first, last + 1);
    try { return JSON.parse(block); } catch {}
    // Try fixing common Arabic transliteration issues + trailing commas
    const fixed = fixArabicTranslitJSON(block);
    try { return JSON.parse(fixed); } catch {}
  }
  // Handle truncated responses — try to close unclosed JSON
  if (first !== -1) {
    let truncated = cleaned.slice(first);
    // Remove any incomplete string value at the end
    truncated = truncated.replace(/,?\s*"[^"]*$/, '');
    // Count unclosed brackets and braces
    let braces = 0, brackets = 0, inString = false, escaped = false;
    for (const ch of truncated) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch === '{') braces++;
        else if (ch === '}') braces--;
        else if (ch === '[') brackets++;
        else if (ch === ']') brackets--;
      }
    }
    if (braces > 0 || brackets > 0) {
      const closers = ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces));
      const attempt1 = truncated.replace(/,\s*$/, '') + closers;
      try { return JSON.parse(attempt1); } catch {}
      const attempt2 = fixArabicTranslitJSON(attempt1);
      try { return JSON.parse(attempt2); } catch {}
    }
  }
  return null;
}

async function callClaudeWithRetry(batch, attempt = 1) {
  try {
    const wordsWithContext = await Promise.all(
      batch.map(async ({ word, pairIds }) => {
        const hits = await searchMeiliForWord(word, 10);
        return { word, hits };
      })
    );
    const prompt = buildAIPrompt(wordsWithContext);
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16384,
      system: 'You are a JSON API. Return ONLY valid JSON. No markdown fences, no commentary. Use ʿ (U+02BF) for ain and ʾ (U+02BE) for hamza in transliterations — NEVER use apostrophes or single quotes which break JSON.',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text;
    const parsed = extractJSON(text);
    if (!parsed) {
      // Write failed response to tmp for debugging
      const debugPath = join(CWD, 'tmp', `jafar-debug-${Date.now()}.txt`);
      writeFileSync(debugPath, text);
      throw new Error(`Failed to parse JSON from AI response (${text.length} chars, saved to ${debugPath})`);
    }
    return parsed;
  } catch (error) {
    const isRetryable = error.status === 429 || error.status === 500 || error.status === 529
      || error.message?.includes('Failed to parse JSON')
      || error.message?.includes('Connection error')
      || error.message?.includes('Request timed out')
      || error.message?.includes('has failed')
      || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
    if (isRetryable && attempt < MAX_RETRY_ATTEMPTS) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
      const reason = error.status === 429 ? 'Rate limited' : error.status >= 500 ? `Server error (${error.status})` : 'JSON parse failed';
      console.log(`  ${reason}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callClaudeWithRetry(batch, attempt + 1);
    }
    // On final failure, return empty object to skip this batch rather than crash
    console.warn(`  Skipping batch after ${attempt} attempts: ${error.message || error.status || 'unknown'}`);
    return {};
  }
}

function buildAIPrompt(wordsWithContext) {
  let prompt = `Analyze these Arabic/Persian words from Baha'i texts and extract linguistic data. For each word, provide:

- root: trilateral root in Arabic script separated by hyphens (e.g., 'ق-ل-ب')
- transliteration: academic transliteration of root using ʿ (U+02BF) for ain and ʾ (U+02BE) for hamza — never use apostrophe or single-quote (e.g., 'q-l-b', 'sh-r-ʿ')
- lemma: dictionary form/stem (e.g., 'قلب')
- meaning: brief English meaning (e.g., 'heart; to turn')
- renderings: array of occurrences in provided passages (max 5 most diverse renderings per word)

For each rendering, include:
- form: exact Arabic/Persian form in passage
- en: English rendering from translation
- src: source excerpt (~30 words centered on the word)
- tr: translation excerpt (~30 words)
- work: work title
- pair_index: passage number

Return valid JSON only. No commentary, no markdown fences. Format:
{
  "word1": {
    "root": "...",
    "transliteration": "...",
    "lemma": "...",
    "meaning": "...",
    "renderings": [...]
  },
  ...
}

Words and passages:

`;

  for (const { word, hits } of wordsWithContext) {
    prompt += `\n## ${word}\n`;
    for (const hit of hits) {
      prompt += `- Work: ${hit.work} §${hit.pair_index}\n`;
      prompt += `  Source: ${hit.source_text.substring(0, 200)}...\n`;
      prompt += `  Translation: ${hit.translation.substring(0, 200)}...\n`;
    }
  }
  return prompt;
}

function extractExcerpt(text, targetWord, windowSize = 30) {
  const words = text.split(/\s+/);
  const targetNorm = stripTashkil(targetWord);
  const idx = words.findIndex(w => stripTashkil(w).includes(targetNorm));
  if (idx === -1) return text.split(/\s+/).slice(0, windowSize).join(' ');
  const start = Math.max(0, idx - Math.floor(windowSize / 2));
  const end = Math.min(words.length, start + windowSize);
  return words.slice(start, end).join(' ');
}

function saveCheckpoint(checkpoint) {
  mkdirSync(join(CWD, 'tmp'), { recursive: true });
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
}

async function processBatches(wordMap, phrases) {
  let checkpoint = loadCheckpoint();
  if (!checkpoint) {
    checkpoint = {
      processed_words: [],
      roots: {},
      occurrences: [],
    };
  }
  const processedSet = new Set(checkpoint.processed_words);
  const allWords = Array.from(wordMap.entries())
    .map(([word, pairIds]) => ({ word, pairIds }))
    .filter(({ word }) => !processedSet.has(word));
  const totalWords = allWords.length;
  console.log(`Processing ${totalWords} remaining words (${checkpoint.processed_words.length} already done)...`);
  const batches = [];
  for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
    batches.push(allWords.slice(i, i + BATCH_SIZE));
  }
  const startTime = Date.now();
  let processedCount = checkpoint.processed_words.length;
  for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
    const batchGroup = batches.slice(i, i + CONCURRENT_BATCHES);
    const results = await Promise.all(
      batchGroup.map(batch => callClaudeWithRetry(batch))
    );
    for (const result of results) {
      for (const [word, data] of Object.entries(result)) {
        if (!data || !data.root) continue; // skip malformed entries
        processedSet.add(word);
        checkpoint.processed_words.push(word);
        processedCount++;
        if (!checkpoint.roots[data.root]) {
          checkpoint.roots[data.root] = {
            id: Object.keys(checkpoint.roots).length + 1,
            transliteration: data.transliteration || '',
            meaning: data.meaning || '',
          };
        }
        const rootId = checkpoint.roots[data.root].id;
        for (const rendering of data.renderings || []) {
          if (!rendering) continue;
          const work = rendering.work || 'Unknown';
          checkpoint.occurrences.push({
            root_id: rootId,
            form: rendering.form || word,
            stem: data.lemma || word,
            en: rendering.en || '',
            src: rendering.src || '',
            tr: rendering.tr || '',
            ref: `${ABBR[work] || work}§${rendering.pair_index || 0}`,
            pair_id: `${work.toLowerCase().replace(/\s+/g, '-')}-${rendering.pair_index || 0}`,
          });
        }
      }
    }
    saveCheckpoint(checkpoint);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processedCount / elapsed;
    const remaining = totalWords - processedCount;
    const eta = remaining / rate;
    console.log(
      `Batch ${i / CONCURRENT_BATCHES + 1}/${Math.ceil(batches.length / CONCURRENT_BATCHES)}: ` +
      `${processedCount}/${totalWords} words (${Math.round(processedCount / totalWords * 100)}%) | ` +
      `${rate.toFixed(1)} words/s | ` +
      `ETA: ${Math.round(eta / 60)}m`
    );
  }
  return checkpoint;
}

function buildCrossRootLinks(checkpoint) {
  console.log('Building cross-root links...');
  const enToRoots = new Map();
  for (const occ of checkpoint.occurrences) {
    const en = occ.en.toLowerCase().trim();
    if (!enToRoots.has(en)) {
      enToRoots.set(en, new Set());
    }
    enToRoots.get(en).add(occ.root_id);
  }
  for (const [root, data] of Object.entries(checkpoint.roots)) {
    const similar = new Set();
    for (const occ of checkpoint.occurrences) {
      if (occ.root_id !== data.id) continue;
      const en = occ.en.toLowerCase().trim();
      const sharedRoots = enToRoots.get(en) || new Set();
      for (const otherRootId of sharedRoots) {
        if (otherRootId !== data.id) {
          similar.add(otherRootId);
        }
      }
    }
    data.similar = similar.size > 0 ? JSON.stringify(Array.from(similar)) : null;
  }
  console.log('✓ Cross-root links built');
}

function writeSQLite(checkpoint) {
  console.log('Writing SQLite database...');
  mkdirSync(join(CWD, 'data'), { recursive: true });
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
  }
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE roots (
      id              INTEGER PRIMARY KEY,
      root            TEXT NOT NULL UNIQUE,
      transliteration TEXT NOT NULL,
      meaning         TEXT NOT NULL,
      similar         TEXT
    );

    CREATE TABLE occurrences (
      id       INTEGER PRIMARY KEY,
      root_id  INTEGER NOT NULL REFERENCES roots(id),
      form     TEXT NOT NULL,
      stem     TEXT NOT NULL,
      en       TEXT NOT NULL,
      src      TEXT NOT NULL,
      tr       TEXT NOT NULL,
      ref      TEXT NOT NULL,
      pair_id  TEXT NOT NULL
    );

    CREATE INDEX idx_occ_form ON occurrences(form);
    CREATE INDEX idx_occ_stem ON occurrences(stem);
    CREATE INDEX idx_occ_root ON occurrences(root_id);
    CREATE INDEX idx_occ_en   ON occurrences(en);
  `);
  const insertRoot = db.prepare(
    'INSERT INTO roots (id, root, transliteration, meaning, similar) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [root, data] of Object.entries(checkpoint.roots)) {
    insertRoot.run(data.id, root, data.transliteration, data.meaning, data.similar);
  }
  const insertOcc = db.prepare(
    'INSERT INTO occurrences (root_id, form, stem, en, src, tr, ref, pair_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const occ of checkpoint.occurrences) {
    insertOcc.run(
      occ.root_id,
      occ.form,
      occ.stem,
      occ.en,
      occ.src,
      occ.tr,
      occ.ref,
      occ.pair_id
    );
  }
  db.close();
  console.log(`✓ Database written to ${DB_PATH}`);
  console.log(`  Roots: ${Object.keys(checkpoint.roots).length}`);
  console.log(`  Occurrences: ${checkpoint.occurrences.length}`);
}

async function main() {
  console.log('Jafar Dictionary Builder');
  console.log('========================\n');
  await checkMeilisearchPopulated();
  const phrases = JSON.parse(readFileSync(PHRASES_PATH, 'utf-8'));
  console.log(`Loaded ${phrases.length} phrase pairs`);
  const wordMap = extractUniqueWords(phrases);
  const checkpoint = await processBatches(wordMap, phrases);
  buildCrossRootLinks(checkpoint);
  await writeSQLite(checkpoint);
  console.log('\n✓ Jafar dictionary build complete');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
