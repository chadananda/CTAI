# Jafar Dictionary Build Pipeline

Pre-computed root concordance for Arabic/Persian text lookup. Moves all AI and search costs to build time so runtime queries are pure SQLite reads with zero external dependencies.

## Architecture Overview

```
                          BUILD TIME (one-time)
  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
  │ tmp/          │    │ Meilisearch │    │ Claude Haiku │
  │ phrases.json  │───>│ (hybrid     │───>│ (root +      │
  │ (2,530 pairs) │    │  search)    │    │  rendering   │
  └──────────────┘    └─────────────┘    │  analysis)   │
                                          └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │ data/        │
                                          │ jafar.db     │
                                          │ (~3-4 MB)    │
                                          └──────────────┘

                          RUNTIME (every query)
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ User input:  │    │ concordance  │    │ SQLite       │
  │ "نار الحبّ"  │───>│ .js          │───>│ (indexed     │
  │              │    │ (normalize + │    │  lookups)    │
  └──────────────┘    │  tokenize)   │    └──────────────┘
                      └──────────────┘
                       Zero AI, Zero Meilisearch
```

## The Problem

The corpus is Shoghi Effendi's translations of Baha'i texts: 2,530 source/translation paragraph pairs across 11 works. Users search Arabic/Persian phrases and expect to see every occurrence of each word across the corpus, with the English rendering Shoghi Effendi chose, organized by trilateral root.

The original implementation required 2+ AI calls per query (term extraction + per-term lookup via Meilisearch + Claude). This was slow (~5s per query), expensive, and required both Meilisearch and an Anthropic API key at runtime.

Since the corpus is fixed, the entire concordance can be pre-computed.

## Corpus Statistics

| Metric | Count |
|--------|-------|
| Source/translation pairs | 2,530 |
| Total tokens in source texts | ~126,000 |
| Unique forms (pre-normalization) | ~25,700 |
| Unique forms (post-normalization) | ~20,200 |
| Forms filtered as stop words | ~5,500 |
| Hapax legomena (appear once) | ~10,800 |
| Estimated trilateral roots | ~1,000-1,500 |

## Normalization: The Core Challenge

### Why normalization is hard

Arabic and Persian share the Arabic script but use different character variants for the same letters. The same word can appear in the corpus with Arabic orthography, Persian orthography, or a mix. Without normalization, `بين` (Arabic ya ي) and `بین` (Persian ya ی) are different strings — they won't match each other, and a stop word list containing one won't catch the other.

The problem compounds across multiple character pairs:

| Character | Unicode | Name | Normalized to |
|-----------|---------|------|---------------|
| ي | U+064A | Arabic Ya | ی (U+06CC Persian Ya) |
| ك | U+0643 | Arabic Kaf | ک (U+06A9 Persian Kaf) |
| أ | U+0623 | Alef with Hamza Above | ا (U+0627 Plain Alef) |
| إ | U+0625 | Alef with Hamza Below | ا (U+0627 Plain Alef) |
| آ | U+0622 | Alef with Madda | ا (U+0627 Plain Alef) |
| ٱ | U+0671 | Alef Wasla | ا (U+0627 Plain Alef) |
| ة | U+0629 | Taa Marbuta | ه (U+0647 Ha) |
| ى | U+0649 | Alef Maqsura | ی (U+06CC Persian Ya) |
| ؤ | U+0624 | Hamza on Waw | و (U+0648 Waw) |
| ئ | U+0626 | Hamza on Ya | ی (U+06CC Persian Ya) |

Additionally, Arabic diacritics (tashkil) are inconsistently applied:
- `U+064B` through `U+065F` — fatha, damma, kasra, shadda, sukun, etc.
- `U+0670` — superscript alef

And punctuation is sometimes attached to tokens (no space between word and `،` or `.` or `:`).

### The normalization function

Both the build script (`cleanToken`) and the runtime module (`normalize`) apply identical transformations:

```js
function normalize(token) {
  let t = token
    // Strip punctuation (Arabic + Latin) and zero-width characters
    .replace(/[.*,:;\?\!\(\)\[\]\{\}«»\u060C\u061B\u061F\u06D4…\u200C\u200D\u200E\u200F]/g, '');
  // Strip tashkil (diacritics)
  t = t.replace(/[\u064B-\u065F\u0670]/g, '');
  // Unify character variants
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
```

This reduces `كَلِمَة` / `کلمه` / `كلمة` to the same canonical form `کلمه`.

### Lesson learned: normalize your stop words

The first implementation had stop words written in their "natural" form (e.g., `الّذي` with shaddah, `إلى` with hamza below, `بين` with Arabic ya). But corpus tokens were being normalized before comparison (stripping tashkil, converting ya/kaf). This created invisible mismatches:

- Stop word `الّذي` (with shaddah) → normalized to `الذی`
- Corpus token `الذي` (no shaddah, Arabic ya) → normalized to `الذی`
- **But the stop word set contained `الّذي`, not `الذی`** → miss!

The fix: write stop words in natural human-readable form, then normalize them through the same function at module load time:

```js
const _STOP_RAW = ['الّذي', 'إلى', 'بين', ...];  // human-readable
const STOP_WORDS = new Set(_STOP_RAW.map(normalize)); // machine-comparable
```

This ensures the stop word set and the token normalizer are always in sync. Any encoding variant in the raw list gets collapsed to the same canonical form.

### Punctuation contamination

The source texts sometimes have punctuation attached directly to words with no intervening space. Analysis of the corpus found 7,160 tokens (3,009 unique forms) with embedded punctuation:

| Pattern | Count | Example |
|---------|-------|---------|
| `*` | 1,401 | Paragraph markers |
| Trailing `:` | 131 | `فرمايد:` (says:) |
| `[` / `]` | 185 | Section markers |
| Trailing `.` | 300+ | `است.` (is.) |
| Arabic comma `،` | 100+ | `أمرك،` |
| `...` | 52 | Ellipsis |
| `؟` | 50 | Question mark |

The normalizer strips all of these before any further processing.

### Zero-width characters

Persian text commonly uses the Zero-Width Non-Joiner (U+200C, ZWNJ) to control letter joining. For example, `می‌خواهد` uses ZWNJ between `می` and `خواهد`. The normalizer strips these (along with ZWJ, LRM, RLM) to avoid invisible characters creating false mismatches.

## Stop Word Categories

The stop list contains ~147 unique normalized forms across these categories:

| Category | Examples | Why stopped |
|----------|----------|-------------|
| Arabic particles | و، في، من، على، إلى، عن | No semantic content |
| Arabic conjunctions | بل، ثمّ، أو، أم، إلا | Structural, not content |
| Arabic pronouns | هو، هي، هم، أنت، أنتم | Reference, not meaning |
| Arabic demonstratives | ذلك، هذا، هذه، تلك | Pointing, not content |
| Arabic relatives | الّذي، الّتي، الّذين | Structural |
| Arabic copula | كان، كنت، كانت | Auxiliary verbs |
| Arabic quantifiers | كلّ، بعض، جميع | Not root-meaningful |
| Arabic clitics | له، لها، فيه، منه، عليه | Pronominal, not lexical |
| Compound particles | ولا، وما، بما، عما | Preposition + particle |
| Persian particles | است، در، با، را، که، تا | Structural |
| Persian auxiliaries | شد، شده، شود، بود، بوده، گشت، نمود | Auxiliary verbs |
| Persian pronouns | خود، شما، ایشان | Reference |
| Persian connectives | چنانچه، همچنين، دیگر، چون | Structural |

These were identified empirically by running the tokenizer against the full corpus and examining high-frequency words. Words like `الله` (God, 1,379 occurrences) and `ظهور` (manifestation, 308 occurrences) are **not** stopped — they are genuine content words central to the texts.

## Meilisearch as Build-Time Intermediary

### Role

Meilisearch serves as a passage retrieval engine during the build. For each unique content word, we search Meilisearch to find the passages where that word (or morphological variants) appears. These passages become context for the AI call.

### Why Meilisearch, not just grep

1. **Morphological awareness** — Meilisearch's tokenizer handles some Arabic morphology (prefix/suffix stripping), so searching `قلب` also finds passages containing `قلوبهم` or `بقلبک`.
2. **Semantic search via embeddings** — The `phrases` index is configured with OpenAI `text-embedding-3-large` vectors. This means searching a word can also surface semantically related passages that use synonyms or different roots with similar meaning.
3. **Ranking** — Meilisearch returns the most relevant passages first, so the AI gets the best context within the 10-hit limit.

### Configuration

```js
// scripts/setup-meili.js
await phrases.updateEmbedders({
  default: {
    source: 'openAi',
    apiKey: OPENAI_API_KEY,
    model: 'text-embedding-3-large',  // 3072-dim vectors
    documentTemplate: '{{doc.full_text}}',
  },
});
```

The build script uses keyword-only search (no hybrid) because the input is a single Arabic word — semantic search adds little value for single-token queries. The embeddings are more valuable for the separate phrase search feature.

### Prerequisite

Meilisearch must be running locally with the `phrases` index populated:

```bash
meilisearch --db-path ./tmp/meili-data &
npm run setup-meili   # creates indexes, configures embedders
npm run index         # uploads 2,530 phrases + 7,662 concepts
```

The build script checks that the index is populated before starting.

## AI Processing (Claude Haiku)

### What the AI does

For each batch of ~15 words, Claude Haiku receives:
- The words themselves
- Up to 10 Meilisearch passages per word (source text + English translation + work reference)

And returns structured JSON:

```json
{
  "قلب": {
    "root": "ق-ل-ب",
    "transliteration": "q-l-b",
    "lemma": "قلب",
    "meaning": "heart; to turn",
    "renderings": [
      {
        "form": "قلوب",
        "en": "hearts",
        "src": "...قلوب منيره و صدور منشرحه...",
        "tr": "...whose hearts are enlightened...",
        "work": "Epistle to the Son of the Wolf",
        "pair_index": 10
      }
    ]
  }
}
```

### Why AI is necessary

Arabic morphology is notoriously difficult for rule-based systems:

1. **Broken plurals** — `قلب` (heart) → `قلوب` (hearts). No suffix rule derives this; it's a vowel-pattern change inside the root. The AI knows `قلوب` is the plural of `قلب` and assigns it to root `ق-ل-ب`.

2. **Root identification** — Determining the trilateral root from a surface form requires knowledge of morphological patterns. `استقامت` (steadfastness) → root `ق-و-م` (to stand). A stemmer can't reliably extract this.

3. **Rendering identification** — Given a source passage and its English translation, the AI identifies which English word corresponds to which Arabic/Persian word. This is the core value: "In this passage, Shoghi Effendi rendered `قلوب` as 'hearts'."

4. **Lemma assignment** — The AI assigns dictionary lemmas (the `stem` column). `قلوبهم` → lemma `قلب`, `بقلبه` → lemma `قلب`. This enables stem-based lookup at runtime.

### Batching strategy

- **15 words per batch** — Balances prompt size against API overhead
- **10 concurrent batches** — Saturates API throughput without triggering rate limits
- **~1,350 total API calls** — For 20,238 unique content words
- **Exponential backoff** — On 429 (rate limit), retries after 1s, 2s, 4s

### Checkpoint/resume

After every batch group (10 batches), progress is saved to `tmp/jafar-build-progress.json`:

```json
{
  "processed_words": ["قلب", "نار", ...],
  "roots": { "ق-ل-ب": { "id": 1, "transliteration": "q-l-b", "meaning": "heart" }, ... },
  "occurrences": [ ... ]
}
```

If the script is interrupted, restarting it loads the checkpoint and skips already-processed words. This is critical because:
- The full build takes 10-20 minutes
- API costs are ~$5-15 and shouldn't be re-incurred
- Network issues or rate limits may cause interruptions

## Cross-Root Links

After all words are processed, the build script identifies roots that share English renderings. For example, if both `ق-ل-ب` (qalb) and `ف-ء-د` (fu'ad) have occurrences rendered as "heart" in English, they are linked via the `similar` column.

```sql
-- Root ق-ل-ب has similar: [42] pointing to ف-ء-د
SELECT * FROM roots WHERE id = 42;
-- → root: 'ف-ء-د', meaning: 'heart, mind'
```

This enables a "See also" feature at runtime: when a user looks up `قلب`, they also see that `فؤاد` is rendered similarly.

The algorithm:
1. Group all occurrences by their `en` (English rendering), lowercased
2. For each root, find all English renderings it has
3. For each of those renderings, find all *other* roots that share it
4. Store the set of other root IDs as a JSON array in `roots.similar`

## SQLite Schema

```sql
CREATE TABLE roots (
  id              INTEGER PRIMARY KEY,
  root            TEXT NOT NULL UNIQUE,   -- 'ق-ل-ب'
  transliteration TEXT NOT NULL,          -- 'q-l-b'
  meaning         TEXT NOT NULL,          -- 'heart; to turn'
  similar         TEXT                    -- JSON: [42, 87] (other root IDs)
);

CREATE TABLE occurrences (
  id       INTEGER PRIMARY KEY,
  root_id  INTEGER NOT NULL REFERENCES roots(id),
  form     TEXT NOT NULL,    -- exact Arabic form in passage: 'قلوبهم'
  stem     TEXT NOT NULL,    -- AI-assigned lemma: 'قلب'
  en       TEXT NOT NULL,    -- English rendering: 'hearts'
  src      TEXT NOT NULL,    -- source excerpt (~30 words)
  tr       TEXT NOT NULL,    -- translation excerpt
  ref      TEXT NOT NULL,    -- 'ESW§10'
  pair_id  TEXT NOT NULL     -- 'epistle-to-the-son-of-the-wolf-10'
);

CREATE INDEX idx_occ_form ON occurrences(form);
CREATE INDEX idx_occ_stem ON occurrences(stem);
CREATE INDEX idx_occ_root ON occurrences(root_id);
CREATE INDEX idx_occ_en   ON occurrences(en);
```

### Column design notes

- **`form`** — The exact Arabic/Persian surface form as it appears in the passage. Used for exact-match lookup at runtime.
- **`stem`** — The AI-assigned dictionary lemma. `قلوبهم` → `قلب`. Enables lookup by dictionary form when the exact surface form isn't in the DB. This is where AI adds the most value — mechanical stemmers can't handle broken plurals.
- **`en`** — Enables rendering-based queries: "Show me everything rendered as 'heart'."
- **`ref`** — Abbreviated work reference: `ESW§10` = Epistle to the Son of the Wolf, paragraph 10.
- **`pair_id`** — Links back to `tmp/phrases.json` entries for full passage retrieval.
- **`similar`** — JSON array rather than a join table. The data is small and read-only; the simplicity of a JSON column outweighs the normalization benefit of a separate table.

## Runtime Lookup (concordance.js)

### Lookup cascade

When the user enters a phrase like `نار الحبّ`:

1. **Tokenize** — Split on whitespace, normalize each token, filter stop words → `['نار', 'حب']`

2. **For each token, cascade through lookup strategies:**
   - Exact form match: `WHERE form = 'نار'`
   - If miss, generate affix-stripped variants and retry: `['نار', 'ار']`
   - If still miss, try stem match: `WHERE stem = 'نار'`
   - If still miss, try stem variants

3. **Once a hit is found**, extract the `root_id` and fetch:
   - Root metadata (transliteration, meaning)
   - ALL occurrences for that root (not just the matching ones)
   - Similar roots from the `similar` JSON column

4. **Deduplicate by root** — If two input tokens resolve to the same root, only include it once.

### Affix stripping

A lightweight cascade for Arabic/Persian prefixes and suffixes:

```
Prefixes: ال، لل، وال، فال، بال، کال، و، ف، ب، ل، ک
Suffixes: ه، ها، هم، هن، ی، نا، کم، کن، ک، ات، ون، ين، ان
```

For each word, generates all possible stripped forms (prefix only, suffix only, both). Length constraint: remaining stem must be > 1 character.

This is deliberately simple. It doesn't need to be linguistically perfect because the AI already solved the hard cases at build time — every corpus form is indexed in the `form` column, and every lemma is in the `stem` column. The affix stripping just helps match user input (which may have affixes) to the indexed forms.

### Broken plural handling

User enters `قلوب` (hearts, broken plural). The mechanical stemmer can't reduce it to `قلب`. But `قلوب` IS in the database as a `form` value (the AI identified it at build time) → exact match succeeds → `root_id` points to `ق-ل-ب` → all forms of that root returned.

This is the key insight: **AI solves the hard morphology once at build time; runtime just does indexed lookups.**

## Files

| File | Role |
|------|------|
| `scripts/jafar-dictionary-build.js` | One-time build script. Requires Meilisearch + ANTHROPIC_API_KEY. |
| `src/lib/concordance.js` | Runtime lookup module. Zero external deps (just SQLite). |
| `src/lib/research.js` | Thin wrapper: delegates to concordance.js |
| `src/pages/api/research.js` | POST endpoint for the search UI |
| `src/components/JafarSearch.svelte` | Search UI (example phrases, results rendering) |
| `data/jafar.db` | Pre-computed concordance database (committed to repo) |
| `tmp/jafar-build-progress.json` | Build checkpoint (gitignored) |

## Running the Build

### Prerequisites

1. `tmp/phrases.json` must exist (run `npm run parse-corpus` if not)
2. Meilisearch must be running with the `phrases` index populated:
   ```bash
   meilisearch --db-path ./tmp/meili-data &
   npm run setup-meili
   npm run index
   ```
3. Environment variables:
   - `ANTHROPIC_API_KEY` — for Claude Haiku calls
   - `MEILI_URL` — default `http://localhost:7700`
   - `MEILI_API_KEY` — default empty (local dev)
   - `OPENAI_API_KEY` — needed by `setup-meili` for embedding config

### Build

```bash
npm run build-jafar
```

Output: `data/jafar.db` (~3-4 MB). Commit to repo. Re-run only if corpus changes.

### Estimated costs

| Resource | Cost |
|----------|------|
| Claude Haiku API | ~$5-15 one-time |
| OpenAI embeddings | Already paid during `npm run index` |
| Build time | ~10-20 minutes |
| Runtime per query | 0 (SQLite only) |

## Deployment

- **Dev:** `data/jafar.db` via `better-sqlite3` (synchronous, fast, no network)
- **Prod:** Cloudflare D1 — `wrangler d1 create jafar`, push schema + data. Same SQL, different driver binding.
