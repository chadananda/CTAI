---
title: "Building an AI-Assisted Shoghi Effendi Translation Lookup Dictionary"
date: "2026-02-15"
author: "Chad Jones"
excerpt: "How we pre-computed a complete Arabic/Persian root concordance using Claude, Meilisearch, and SQLite — and what we learned about the hidden complexity of mixed-script text processing."
---

I want to tell you about one of the most satisfying pieces of software I've ever built. It's a dictionary — but not a normal one. It's a concordance that maps every significant Arabic and Persian word in Shoghi Effendi's translations to the English rendering he chose, organized by trilateral root, with cross-references to every passage where that root appears. And it runs instantly, with zero AI calls at query time.

The path to getting there was full of surprises. What started as a straightforward "just index every word" problem turned into a deep dive into Arabic morphology, Unicode edge cases, the invisible differences between Arabic and Persian text, and the surprising power of letting AI handle the genuinely hard parts while keeping the runtime path dead simple.

## The corpus

Shoghi Effendi (1897-1957) was the Guardian of the Baha'i Faith. Among his many contributions, he translated key Baha'i texts from Arabic and Persian into English with a distinctive literary style that's been studied by translators ever since. His word choices were deliberate — when he rendered an Arabic word as "sovereignty" in one passage and "dominion" in another, the distinction mattered.

Our corpus contains 2,530 source/translation paragraph pairs across 12 of his major translations: the Kitab-i-Iqan, Gleanings from the Writings of Baha'u'llah, Epistle to the Son of the Wolf, Prayers and Meditations, the Hidden Words, Will and Testament of 'Abdu'l-Baha, and several shorter works. About 126,000 content-word tokens. Not huge by modern standards, but linguistically dense.

The goal: let a researcher type an Arabic or Persian phrase and instantly see every occurrence of each word across the entire corpus, grouped by trilateral root, with the exact English rendering Shoghi Effendi used in each passage.

## The first attempt: AI at runtime

Our first implementation was the obvious one. When a user searched for a phrase like `نار الحبّ` ("the fire of love"):

1. **Call Claude to extract terms** — "What are the significant words here? Skip the particles." Claude would return structured data: `نار` (nār, root ن-و-ر, "fire") and `حبّ` (ḥubb, root ح-ب-ب, "love").

2. **Search Meilisearch** for each term — our search engine has all 2,530 passage pairs indexed with OpenAI embeddings for hybrid semantic+keyword search. This finds passages containing the word or morphological variants.

3. **Call Claude again** with the passages — "Here are 20 passages containing this word. For each one, tell me the exact Arabic form, which English word renders it, and give me short excerpts."

It worked. And it was beautiful when it worked. But it had problems:

- **Slow**: 3-8 seconds per query. Two AI round-trips plus search.
- **Expensive**: Every query burned API tokens.
- **Fragile**: Required both Meilisearch and an Anthropic API key at runtime.
- **Inconsistent**: AI sometimes gave slightly different analyses for the same word across queries.

Then it hit me: **the corpus is fixed**. These 2,530 passages aren't changing. Why compute the same answer every time someone asks?

## The insight: pre-compute everything

If we run the AI analysis once for every word in the corpus and store the results, runtime becomes pure database lookups. No AI, no search engine, no network calls. Just SQLite.

The math was encouraging. The corpus has about 126,000 tokens. After removing stop words (particles, pronouns, prepositions) and normalizing variant spellings, we'd have roughly 20,000 unique content words. Many of those would share roots — the 20,000 forms might collapse into perhaps 1,000-1,500 trilateral roots. We could process them in batches of 15 words per AI call, so about 1,350 API calls total. At Claude Haiku pricing, the entire build would cost maybe $5-15. One-time.

The architecture became:

**Build time** (one-time, ~15 minutes):
- Tokenize all 2,530 passages
- Normalize and deduplicate to ~20,000 unique forms
- For each batch of 15 words: search Meilisearch for context, then ask Claude for root analysis
- Store everything in a SQLite database

**Runtime** (every query, ~1ms):
- Normalize the user's input
- Look up each word in SQLite
- Return all occurrences for each root

Simple. Elegant. What could go wrong?

## The normalization rabbit hole

As it turns out: quite a lot.

### Arabic and Persian share an alphabet (sort of)

Here's something that surprised me. Arabic and Persian both use the Arabic script, but they use *different Unicode characters* for some of the same letters. The letter that English speakers would think of as "y" has two Unicode representations:

- **ي** (U+064A) — Arabic Ya
- **ی** (U+06CC) — Persian Ya

They look almost identical. In most fonts they render the same way. But to a computer, they are completely different characters. `بين` (Arabic ya) and `بین` (Persian ya) — both meaning "between" — are different strings. They won't match each other in a database lookup. A stop word list containing one won't catch the other.

The same problem exists for kaf:

- **ك** (U+0643) — Arabic Kaf
- **ک** (U+06A9) — Persian Kaf

And it gets worse. Arabic has *six* different forms of alef depending on whether it carries a hamza (a glottal stop marker) and where:

| Character | Name | Unicode |
|-----------|------|---------|
| ا | Plain Alef | U+0627 |
| أ | Alef with Hamza Above | U+0623 |
| إ | Alef with Hamza Below | U+0625 |
| آ | Alef with Madda | U+0622 |
| ٱ | Alef Wasla | U+0671 |

Plus taa marbuta (ة) which is often interchangeable with ha (ه) — it's the feminine ending marker, but in Persian texts it's typically written as ه. And alef maqsura (ى) which looks like ya but isn't.

Our corpus, being a mix of Arabic texts and Persian texts with Arabic quotations, had *all* of these variants. The word "to" (إلى in formal Arabic) might appear as `إلى`, `الی`, or `إلی` depending on the text. That's three different strings for the same word.

### The normalizer

The solution was a function that collapses all variants to a single canonical form:

```javascript
function normalize(token) {
  let t = token
    // Strip punctuation and zero-width characters
    .replace(/[.*,:;\?\!\(\)\[\]\{\}«»،؛؟۔…‌‍‎‏]/g, '');
  // Strip tashkil (vowel diacritics)
  t = t.replace(/[\u064B-\u065F\u0670]/g, '');
  // Unify character variants
  t = t.replace(/ي/g, 'ی')   // Arabic ya → Persian ya
    .replace(/ك/g, 'ک')      // Arabic kaf → Persian kaf
    .replace(/ؤ/g, 'و')      // hamza on waw → waw
    .replace(/ئ/g, 'ی')      // hamza on ya → ya
    .replace(/ٱ/g, 'ا')      // alef wasla → plain alef
    .replace(/آ/g, 'ا')      // alef madda → plain alef
    .replace(/أ/g, 'ا')      // hamza above → plain alef
    .replace(/إ/g, 'ا')      // hamza below → plain alef
    .replace(/ة/g, 'ه')      // taa marbuta → ha
    .replace(/ى/g, 'ی');     // alef maqsura → ya
  return t;
}
```

After normalization, `كَلِمَة`, `کلمه`, and `كلمة` all become `کلمه`. One canonical form.

This reduced our unique word count from ~25,700 to ~20,200 — about 5,500 forms that were just spelling variants of each other.

### The stop word trap

With normalization working, I wrote a stop word list — about 150 Arabic and Persian function words: particles (و، في، من), pronouns (هو، هي), prepositions (على، إلى), relative pronouns (الّذي، الّتي), conjunctions (بل، ثمّ), Persian auxiliaries (شد، بود، نمود), and so on.

I tested it. And discovered that `بين` ("between," appearing 315 times) was sailing right through the stop word filter. So were `الذین` ("those who," 270 times), `التی` ("which," 236 times), and `إلا` ("except," 439 times).

The bug was subtle and infuriating. My stop word list contained `بين` with Arabic ya (ي). But the tokens from the corpus, after going through the normalizer, came out as `بین` with Persian ya (ی). The normalizer was working correctly — it unified everything to Persian ya. But the *stop word list itself* hadn't been normalized. I was comparing normalized tokens against un-normalized stop words.

The same issue hit every entry that contained Arabic ya, Arabic kaf, hamza, shaddah (the doubling mark), or taa marbuta. `الّذي` in the stop list had a shaddah on the lam — but the normalizer stripped all tashkil, so the corpus tokens came through as `الذی`. A total mismatch.

The fix was embarrassingly simple: run the stop words through the same normalizer.

```javascript
const _STOP_RAW = ['الّذي', 'إلى', 'بين', ...]; // Human-readable
const STOP_WORDS = new Set(_STOP_RAW.map(normalize)); // Machine-comparable
```

Now you can write stop words however is natural — with or without tashkil, Arabic or Persian letter forms — and the normalizer collapses everything to the same canonical form. The raw list went from 180+ entries to 147 unique normalized forms (many variants mapped to the same thing).

This is one of those lessons you don't forget: **if you normalize your data, you must normalize your reference sets through the exact same function.**

### The invisible characters

There was one more normalization surprise. Persian text commonly uses the Zero-Width Non-Joiner (U+200C, ZWNJ) to control how letters connect. In the word `می‌خواهد` ("he wants"), there's a ZWNJ between `می` and `خواهد` that prevents the two parts from visually joining. You can't see it. It takes up no space. But it's there in the Unicode, and it makes the string different from `میخواهد` without the ZWNJ.

There's also the Zero-Width Joiner (U+200D), Left-to-Right Mark (U+200E), and Right-to-Left Mark (U+200F). None of them produce visible output, but all of them create string mismatches.

We strip all of them.

### Punctuation contamination

One final tokenization issue: the source texts don't always have spaces between words and punctuation. We found 7,160 tokens (out of 126,000) with attached punctuation:

- `فرمايد:` — the word "says" with a trailing colon
- `است.` — "is" with a trailing period
- `أَمْرِكَ،` — "your Cause" with a trailing Arabic comma
- `*` appearing 1,401 times as paragraph/section markers

Without stripping these, `است` and `است.` would be different dictionary entries. The normalizer handles this first, before any other processing.

## Meilisearch as build-time intermediary

For each unique content word, the build script needs to find the passages where it appears. We could do a simple string search through the 2,530 passages, but Meilisearch gives us two advantages:

**Morphological reach**: Meilisearch's Arabic tokenizer handles some prefix/suffix stripping. Searching for `قلب` (heart) also finds passages containing `قلوبهم` (their hearts) or `بقلبک` (with your heart). This gives the AI more context.

**Semantic reach**: Our Meilisearch index is configured with OpenAI `text-embedding-3-large` vectors — 3,072-dimensional embeddings that capture semantic similarity. This means searching for a word can also surface passages with related concepts, even if the exact word doesn't appear.

The build script uses keyword-only search (not hybrid) because we're searching for specific Arabic words, not concepts. But the semantic vectors are there for the phrase search feature and will be available if we ever need them.

Setting up Meilisearch is a prerequisite for the build:

```bash
meilisearch --db-path ./tmp/meili-data &
npm run setup-meili   # Configure indexes + OpenAI embedders
npm run index         # Upload 2,530 phrases + 7,662 concept chunks
```

At runtime, Meilisearch is not needed at all. The SQLite database contains everything.

## Why AI is genuinely necessary

You might wonder: can't we just use a stemmer? Arabic has well-known stemming algorithms. Why involve AI at all?

The answer is **broken plurals**. Arabic has two plural systems. Regular (sound) plurals add a suffix: `معلم` (teacher) → `معلمون` (teachers). A rule-based stemmer handles these fine.

But broken plurals change the *internal vowel pattern* of the word: `قلب` (heart) → `قلوب` (hearts). `كتاب` (book) → `كتب` (books). `رجل` (man) → `رجال` (men). There's no suffix to strip. The word has been restructured from the inside. Arabic has dozens of broken plural patterns, and knowing which one applies to which word requires knowing the word — it's lexical knowledge, not algorithmic.

There's more the AI handles:

**Root identification**: Determining the trilateral root from a surface form requires morphological knowledge. `استقامت` (steadfastness) comes from root `ق-و-م` (to stand). You can't derive that by stripping affixes — the root letters are buried inside a ten-letter word under layers of derivational morphology.

**Rendering identification**: This is the core value. Given an Arabic passage and its English translation side by side, the AI identifies which English word corresponds to which Arabic word. "In this passage, Shoghi Effendi rendered `قلوب` as 'hearts' and `منيره` as 'enlightened'." This requires understanding both languages and their correspondence in context.

**Lemma assignment**: The AI assigns dictionary lemmas (base forms). `قلوبهم` ("their hearts") → lemma `قلب`. `بقلبه` ("with his heart") → lemma `قلب`. This enables stem-based lookup: when a user types the dictionary form of a word, we can find all its inflected occurrences.

## The build pipeline

Here's how the build actually works.

### Step 1: Extract unique words

Load the 2,530 passage pairs. For each one, split the source text on whitespace, normalize each token, and filter out stop words. Collect all unique content words.

Result: 20,238 unique normalized content words.

### Step 2: Batch AI processing

Group the words into batches of 15. For each batch:

1. Search Meilisearch for each word (10 hits per word) to get passage context.
2. Send everything to Claude Haiku in a single prompt: "Here are 15 Arabic/Persian words with passages where they appear. For each word, give me the trilateral root, transliteration, dictionary lemma, English meaning, and every rendering you can identify in the passages."

Claude returns structured JSON:

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

We run 10 batches concurrently for throughput. With exponential backoff on rate limits. About 1,350 total API calls.

### Step 3: Checkpoint/resume

After every group of 10 batches, we save progress to a JSON file. If the script crashes, gets rate-limited, or you just need to stop it, you can restart and it picks up where it left off. No re-processing, no re-paying for API calls already made.

This turned out to be critical. The full build takes 10-20 minutes, and network hiccups happen.

### Step 4: Cross-root links

After all words are processed, we look for roots that share English renderings. If root `ق-ل-ب` (qalb, "heart") and root `ف-ء-د` (fu'ad, also "heart") both have occurrences rendered as "heart" in English, we link them. This enables a "see also" feature: search for `قلب` and learn that `فؤاد` carries similar meaning in these texts.

The algorithm is simple: group all occurrences by their English rendering (lowercased), find all roots for each rendering, and store the cross-references.

### Step 5: Write SQLite

Insert everything into two tables:

**roots**: ~1,000-1,500 rows. Each root has an ID, the Arabic root letters (ق-ل-ب), transliteration (q-l-b), English meaning, and a JSON array of similar root IDs.

**occurrences**: ~12,000+ rows. Each occurrence links to a root and records the exact Arabic form, the AI-assigned lemma, the English rendering, source and translation excerpts, and a paragraph reference (like `ESW§10`).

Four indexes cover the common query patterns: by form, by stem, by root ID, and by English rendering.

The resulting database is about 3-4 MB. We commit it to the repository. It's a static asset, like an image.

## Runtime: the payoff

At query time, the concordance module does no AI calls, no search engine queries, no network requests. Here's the full lookup cascade when a user types `نار الحبّ`:

1. **Normalize**: Strip tashkil, unify character variants, remove punctuation → `['نار', 'حب']`

2. **Filter stop words**: Neither word is a stop word, so both proceed.

3. **For each word, cascade through lookup strategies:**
   - Try exact form match in the `form` column
   - If miss, generate affix-stripped variants (strip common Arabic/Persian prefixes and suffixes) and retry
   - If still miss, try matching against the `stem` column (the AI-assigned lemma)
   - If still miss, try stem variants

4. **Once a hit is found**, look up the root and fetch *all* occurrences for that root — not just the matching ones. If you search `قلوب` (hearts), you get `قلب` (heart), `قلوبهم` (their hearts), `بقلبک` (with your heart) — every form of root ق-ل-ب in the corpus.

5. **Resolve cross-root links**: Parse the `similar` JSON array, look up those roots, include them tagged as "similar."

6. **Deduplicate**: If two input words resolve to the same root, include it only once.

The entire operation takes about 1 millisecond. All of the hard work — root identification, broken plural resolution, rendering matching — was done once by AI at build time and cached forever in SQLite.

## The affix stripping cascade

The runtime lookup includes a lightweight affix stripper for Arabic and Persian. This isn't trying to be a real stemmer — it's just a fallback for when the user's exact input doesn't match any indexed form.

```
Prefixes: ال، لل، وال، فال، بال، کال، و، ف، ب، ل، ک
Suffixes: ه، ها، هم، هن، ی، نا، کم، کن، ک، ات، ون، ين، ان
```

For each word, it generates all possible stripped forms: prefix only, suffix only, both. The remaining stem must be at least 2 characters.

If a user types `بالقلب` ("with the heart"), the stripper generates `القلب`, `بالقل`, `قلب`, `القل`, etc. One of those — `قلب` — will hit the `stem` column, and we're in.

This doesn't need to be linguistically perfect because the AI already indexed every form that actually appears in the corpus. The affix stripper just bridges the gap between what the user types and what's in the database.

## The database schema

Two tables. That's it.

```sql
CREATE TABLE roots (
  id              INTEGER PRIMARY KEY,
  root            TEXT NOT NULL UNIQUE,   -- 'ق-ل-ب'
  transliteration TEXT NOT NULL,          -- 'q-l-b'
  meaning         TEXT NOT NULL,          -- 'heart; to turn'
  similar         TEXT                    -- JSON: [42, 87]
);

CREATE TABLE occurrences (
  id       INTEGER PRIMARY KEY,
  root_id  INTEGER NOT NULL REFERENCES roots(id),
  form     TEXT NOT NULL,    -- 'قلوبهم'
  stem     TEXT NOT NULL,    -- 'قلب'
  en       TEXT NOT NULL,    -- 'hearts'
  src      TEXT NOT NULL,    -- source excerpt
  tr       TEXT NOT NULL,    -- translation excerpt
  ref      TEXT NOT NULL,    -- 'ESW§10'
  pair_id  TEXT NOT NULL     -- 'epistle-to-the-son-of-the-wolf-10'
);
```

The `similar` column uses JSON instead of a join table. The data is small and read-only — the simplicity outweighs the normalization benefit.

The `stem` column is where AI adds the most value. A mechanical stemmer can't get from `قلوب` to `قلب` (broken plural) or from `استقامت` to `قوم` (buried root). But Claude can, and it only needs to do it once.

## What I learned

### AI is great at one-time enrichment

The pattern that emerged — "use AI to pre-compute a static resource, then use dumb lookups at runtime" — feels incredibly powerful. The AI handles the genuinely hard parts (morphological analysis, cross-lingual rendering identification, broken plurals) during a one-time build. Runtime gets the intelligence for free via indexed lookups.

This inverts the usual AI-in-production pattern. Instead of calling AI on every request (slow, expensive, variable), you call it once and crystallize the results. The database becomes a snapshot of the AI's knowledge, frozen in time, queryable forever at microsecond latency.

### Normalization is the foundation

Every subsequent step — stop word filtering, database lookups, affix stripping — depends on normalization being correct and consistent. The bug where stop words weren't normalized through the same function wasted hours and was completely invisible until I inspected the frequency counts.

If you're working with any non-Latin script, invest heavily in normalization up front. Test it by running your full dataset through the normalizer and examining the frequency distribution. The most common words should be stop words. If you see function words in your top-30, your normalizer or your stop word list has a gap.

### The corpus tells you what your stop words should be

I didn't design the stop word list from linguistic theory. I ran the tokenizer, sorted by frequency, and examined the top 100 words. Function words naturally float to the top because they appear in nearly every passage. Content words, no matter how important theologically, appear in a fraction of passages.

`الله` ("God") appears 1,379 times — but it's a content word. `این` ("this") appeared 1,522 times before normalization — pure function word. The frequency distribution makes the distinction obvious.

### Checkpoint everything

The build takes 10-20 minutes and costs money. Network connections drop. Rate limits hit. The first version of the build script had no checkpointing, and I had to restart from zero twice before adding it. Now it saves after every batch group and resumes cleanly. The extra 20 lines of code saved hours of rebuild time and dollars of API cost.

### SQLite is absurdly fast for this

The entire concordance — roots, occurrences, indexes — fits in about 3-4 MB. A query touches maybe 3-4 index lookups and reads 50-100 rows. On modern hardware this takes under a millisecond. We replaced a 5-second, two-API-call pipeline with a sub-millisecond local read. That's a 5,000x speedup.

For production, the same SQLite database can be loaded into Cloudflare D1. Same SQL, same data, same speed — just at the edge instead of locally.

## The result

A researcher can now type any Arabic or Persian phrase from the Baha'i sacred texts and instantly see:

- Every significant word, identified by trilateral root
- Academic transliteration and English meaning for each root
- Every occurrence of that root across all 12 translations
- The exact English rendering Shoghi Effendi chose in each passage
- Source and translation excerpts for context
- Cross-references to roots with similar English renderings
