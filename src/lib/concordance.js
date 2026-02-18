// Runtime SQLite lookup for Jafar concordance database
// Supports both better-sqlite3 (local dev) and Cloudflare D1 (production)

// Work name abbreviations — applied at query time to clean up refs
const ABBR = {
  'Will and Testament': 'W&T',
  'Epistle to the Son of the Wolf': 'ESW',
  'Fire Tablet': 'Fire',
  'Gleanings': 'GWB',
  "Kitab-i-'Ahd": 'Ahd',
  'Kitab-i-Iqan': 'KIQ',
  'Prayers and Meditations': 'P&M',
  'Tablet of Ahmad': 'Ahmad',
  'Tablet of Carmel': 'Carmel',
  'Tablet of the Holy Mariner': 'Mariner',
  'The Hidden Words': 'HW',
  'Hidden Words': 'HW',
};

// Clean up ref: abbreviate work name, keep only first number (drop rendering index)
function cleanRef(ref) {
  if (!ref) return '';
  // Format: "Work Name §pair_index§rendering_index" or "Work Name§pair_index§rendering_index"
  const parts = ref.split('§');
  if (parts.length < 2) return ref;
  const work = parts[0].trim();
  const pairIdx = parts[1]; // keep first number, ignore rest
  const abbr = ABBR[work] || work;
  return `${abbr} ${pairIdx}`;
}

// Stop words — written naturally, normalized at runtime via normalize()
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
  // Arabic relative pronouns
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

// Affix stripping
const PREFIXES = ['ال','لل','وال','فال','بال','کال','و','ف','ب','ل','ک'];
const SUFFIXES = ['ه','ها','هم','هن','ی','نا','کم','کن','ک','ات','ون','ين','ان','ا','تان','تین'];

// Strip tashkil, punctuation, and normalize character variants
function normalize(token) {
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
const STOP_WORDS = new Set(_STOP_RAW.map(normalize));

// Generate all possible stripped forms
function variants(word) {
  const results = new Set([word]);
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix)) {
      const stripped = word.slice(prefix.length);
      if (stripped.length > 1) results.add(stripped);
    }
  }
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix)) {
      const stripped = word.slice(0, -suffix.length);
      if (stripped.length > 1) results.add(stripped);
    }
  }
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix)) {
      for (const suffix of SUFFIXES) {
        const withoutPrefix = word.slice(prefix.length);
        if (withoutPrefix.endsWith(suffix)) {
          const stripped = withoutPrefix.slice(0, -suffix.length);
          if (stripped.length > 1) results.add(stripped);
        }
      }
    }
  }
  return Array.from(results);
}

// Split phrase into content words
function tokenize(phrase) {
  return phrase
    .split(/\s+/)
    .map(normalize)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// ── Database adapters ──

let _localDb = null;

// Dynamic import for better-sqlite3 (so Cloudflare Workers don't choke on native module)
async function getLocalDb() {
  if (_localDb) return _localDb;
  try {
    const { default: Database } = await import('better-sqlite3');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const { existsSync } = await import('node:fs');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const dbPath = join(__dirname, '..', '..', 'data', 'jafar.db');
    if (!existsSync(dbPath)) return null;
    _localDb = new Database(dbPath, { readonly: true });
    return _localDb;
  } catch {
    return null;
  }
}

// Unified query interface — works with both better-sqlite3 and D1
async function queryAll(db, sql, params = []) {
  if (db._isD1) {
    const stmt = db.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const { results } = await bound.all();
    return results;
  }
  // better-sqlite3 (synchronous)
  return db.prepare(sql).all(...params);
}

async function queryFirst(db, sql, params = []) {
  if (db._isD1) {
    const stmt = db.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    return await bound.first();
  }
  return db.prepare(sql).get(...params);
}

// Exported for use by concordance pages
export { queryAll, queryFirst, resolveDb };

// Core lookup for single word
async function lookupWord(db, word, phraseNorm = '') {
  let rows = [];

  // 1. Try exact normalized form match
  rows = await queryAll(db, 'SELECT * FROM occurrences WHERE form_norm = ?', [word]);

  // 2. Try variants on normalized form
  if (rows.length === 0) {
    for (const variant of variants(word)) {
      rows = await queryAll(db, 'SELECT * FROM occurrences WHERE form_norm = ?', [variant]);
      if (rows.length > 0) break;
    }
  }

  // 3. Try stem match
  if (rows.length === 0) {
    rows = await queryAll(db, 'SELECT * FROM occurrences WHERE stem = ?', [word]);
  }

  // 4. Try variants on stem
  if (rows.length === 0) {
    for (const variant of variants(word)) {
      rows = await queryAll(db, 'SELECT * FROM occurrences WHERE stem = ?', [variant]);
      if (rows.length > 0) break;
    }
  }

  if (rows.length === 0) return null;

  const rootId = rows[0].root_id;
  const root = await queryFirst(db, 'SELECT * FROM roots WHERE id = ?', [rootId]);
  if (!root) return null;

  // Fetch ALL occurrences for this root
  const allRows = await queryAll(db, 'SELECT * FROM occurrences WHERE root_id = ?', [rootId]);

  // Parse similar roots — find shared English renderings and limit to top 5
  let similar = [];
  if (root.similar) {
    try {
      const similarIds = JSON.parse(root.similar).slice(0, 20); // check up to 20
      const myRenderings = new Set(allRows.map(r => (r.en || '').toLowerCase().trim()));

      const candidates = await Promise.all(
        similarIds.map(async (id) => {
          const r = await queryFirst(db, 'SELECT * FROM roots WHERE id = ?', [id]);
          if (!r) return null;
          const theirRows = await queryAll(db, 'SELECT DISTINCT en FROM occurrences WHERE root_id = ?', [id]);
          const shared = theirRows
            .map(o => (o.en || '').trim())
            .filter(en => myRenderings.has(en.toLowerCase()));
          if (shared.length === 0) return null;
          // Get a sample form for this root
          const sampleRow = await queryFirst(db, 'SELECT form FROM occurrences WHERE root_id = ? LIMIT 1', [id]);
          return {
            root: r.root,
            transliteration: r.transliteration,
            meaning: r.meaning,
            shared: shared.slice(0, 3), // top 3 shared renderings
            sample_form: sampleRow?.form || '',
            score: shared.length,
          };
        })
      );

      similar = candidates
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch (err) {
      console.warn(`[concordance] Failed to parse similar for root ${rootId}:`, err);
    }
  }

  // Filter out rows where the form/en don't actually appear in src/tr
  const validRows = allRows.filter(r => {
    const srcNorm = normalize(r.src || '');
    const formNorm = normalize(r.form || '');
    const trLower = (r.tr || '').toLowerCase();
    const enLower = (r.en || '').toLowerCase();
    return srcNorm.includes(formNorm) && trLower.includes(enLower);
  });

  // Sort: rows whose source contains the full input phrase come first
  if (phraseNorm) {
    validRows.sort((a, b) => {
      const aHas = normalize(a.src || '').includes(phraseNorm) ? 1 : 0;
      const bHas = normalize(b.src || '').includes(phraseNorm) ? 1 : 0;
      return bHas - aHas;
    });
  }

  return {
    word,
    transliteration: root.transliteration,
    root: root.root,
    meaning: root.meaning,
    rows: validRows.map(r => ({
      form: r.form,
      en: r.en,
      src: r.src,
      tr: r.tr,
      ref: cleanRef(r.ref),
    })),
    similar
  };
}

// Resolve a DB connection: prefer D1 binding, fall back to better-sqlite3
async function resolveDb(d1Binding) {
  if (d1Binding) {
    d1Binding._isD1 = true;
    return d1Binding;
  }
  return await getLocalDb();
}

// Main entry point — pass d1Binding from Astro.locals.runtime.env.JAFAR_DB
export async function analyzePhrase(phrase, sourceLang = 'ar', d1Binding = null) {
  const db = await resolveDb(d1Binding);
  if (!db) return { phrase, terms: [] };

  const phraseNorm = normalize(phrase);
  const words = tokenize(phrase);
  const seen = new Set();
  const terms = [];
  for (const word of words) {
    const result = await lookupWord(db, word, phraseNorm);
    if (result && !seen.has(result.root)) {
      seen.add(result.root);
      terms.push(result);
    }
  }
  return { phrase, terms };
}
