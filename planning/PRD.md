# CTAI — Committee Translation AI
## Product Requirements Document v1.0
**Target:** Claude Code implementation guide
**Stack:** ES6 modules · Node.js · Astro/Svelte/Tailwind · Turso · Meilisearch · Stripe
**Methodology:** BDD/TDD — Gherkin specs → Cucumber steps → Vitest units → Playwright e2e
---
## 1. Project Overview
CTAI virtualizes an ideal Bahá'í translation committee. Four AI agents collaborate: three translator agents (each with a distinct critical lens) plus one research agent that supplies relevant precedents from Shoghi Effendi's translation corpus. Input is source text in Arabic or Persian. Output is a phrase-by-phrase translation with notes, assembled into flowing paragraphs, presented in multiple views.
### 1.1 Core Principle
Shoghi Effendi's translations are the gold standard. The system never invents style — it references, matches, and extends established patterns. Every rendering decision must cite precedent or explicitly note departure.
### 1.2 Interfaces
- **CLI** — corpus import, index management, translation jobs, cache admin
- **REST API** — programmatic translation, search, job status, billing
- **Web App** — interactive translation workspace, corpus browser, output views
### 1.3 Monorepo Structure
```
ctai/
├── packages/
│   ├── core/           # shared business logic, agent orchestration, types
│   ├── cli/            # CLI tool (commander.js)
│   ├── api/            # REST API (Hono)
│   ├── web/            # Astro/Svelte app
│   ├── corpus/         # DOCX parsing, staging, segmentation, indexing pipeline
│   └── search/         # Meilisearch client, hybrid search helpers
├── features/           # Gherkin .feature files (shared BDD specs)
├── tests/
│   ├── unit/           # Vitest unit tests
│   ├── integration/    # Vitest integration tests
│   └── e2e/            # Playwright browser tests
├── prompts/            # Agent system prompts (version-controlled markdown)
├── docs/               # Architecture docs, API spec
├── vitest.config.js
├── cucumber.config.js
├── playwright.config.js
└── package.json
```
---
## 2. Corpus Pipeline (`packages/corpus`)
### 2.1 DOCX Parsing
**Input:** Side-by-side DOCX files containing two-column tables. Column 1 = source (Arabic or Persian). Column 2 = English translation by Shoghi Effendi.
**Parser requirements:**
- Use `mammoth` or `python-docx` (via child process) to extract table rows
- Handle vertically merged cells (`vMerge` in OOXML) — detect and flag
- Handle column-based layouts (non-table side-by-side) as alternate parse path
- Detect and flag: empty cells, column swaps (script detection), nested tables
- Preserve row order and document source metadata
- Support both `.doc` (via LibreOffice conversion) and `.docx` native
**CLI command:** `ctai corpus import <glob-pattern> [--dry-run]`
### 2.2 Staging Database
SQLite (local file during import, not Turso) for staging and verification.
```sql
CREATE TABLE corpus_sources (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  title TEXT,
  author TEXT,
  source_lang TEXT CHECK(source_lang IN ('ar', 'fa')),
  imported_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE staging_pairs (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES corpus_sources(id),
  row_index INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translation_text TEXT NOT NULL,
  -- Alignment verification
  alignment_status TEXT DEFAULT 'unchecked'
    CHECK(alignment_status IN ('unchecked','auto_passed','flagged','verified','rejected')),
  alignment_notes TEXT,
  -- Heuristic scores
  length_ratio REAL,
  script_check_passed BOOLEAN,
  -- Metadata
  chapter TEXT,
  section TEXT,
  page_ref TEXT
);
CREATE INDEX idx_staging_status ON staging_pairs(alignment_status);
```
### 2.3 Automated Alignment Checks
Run sequentially on all imported rows:
1. **Script detection** — verify col 1 contains Arabic/Persian script, col 2 contains Latin. Flag swaps.
2. **Length ratio** — compute `len(source)/len(translation)`. Flag outliers beyond 2 std deviations from corpus mean.
3. **Empty cell detection** — flag rows where either cell is empty or whitespace-only.
4. **Paragraph count mismatch** — flag cells containing multiple `\n\n` breaks (likely should be separate rows).
5. Rows passing all checks → `auto_passed`. Any failure → `flagged`.
**CLI command:** `ctai corpus check [--source-id <id>]`
### 2.4 AI Alignment Verification
For flagged rows + random 10% sample of auto_passed rows:
- Batch API call: "Are these plausible translation pairs? If not, diagnose the issue."
- Use cheapest capable model (Haiku)
- Update `alignment_status` and `alignment_notes` with AI assessment
- Rows AI flags → manual review queue
**CLI command:** `ctai corpus verify [--source-id <id>] [--sample-rate 0.1]`
### 2.5 Manual Review
**CLI command:** `ctai corpus review` — interactive TUI showing flagged pairs with neighbors for context. Accept/reject/edit.
**Web route:** `/admin/corpus/review` — same functionality with richer UI.
### 2.6 Indexing to Meilisearch
Export verified and segmented pairs to Meilisearch. Each document:
```json
{
  "id": "pair_123",
  "source_id": 1,
  "source_text": "...",
  "translation_text": "...",
  "full_text": "... ...",
  "source_lang": "ar",
  "work_title": "Kitáb-i-Íqán",
  "chapter": "Part One",
  "row_index": 42,
  "phrase_count": 8,
  "sentence_count": 3,
  "has_segmentation": true
}
```
**Meilisearch config:**
- Searchable fields: `source_text`, `translation_text`, `full_text`
- Filterable: `source_lang`, `work_title`, `source_id`
- Sortable: `row_index`
- Embedder: OpenAI `text-embedding-3-large` on `full_text` field
- Enable hybrid search (BM25 + semantic)
**CLI command:** `ctai corpus index [--rebuild] [--source-id <id>]`
---
## 3. Search Layer (`packages/search`)
### 3.1 Research Search Strategy
The research agent executes searches in structured passes:
1. **Term extraction** — AI identifies theologically/linguistically significant terms from the source passage
2. **Term-level search** — exact BM25 search per significant term in `source_text` field
3. **Phrase-level semantic search** — semantic search on `full_text` for conceptual similarity
4. **Phrase-level corpus lookup** — retrieve pre-segmented phrases from the Shoghi Effendi corpus matching specific terms (enables sub-paragraph precision)
5. **Context expansion** — for top hits, fetch neighboring pairs (±2 rows) for surrounding context
### 3.2 Search API (`packages/search`)
```js
// Core search functions
search(query, { field, mode, limit }) → hits[]
// mode: 'bm25' | 'semantic' | 'hybrid'
getNeighbors(pairId, range) → pairs[]
buildReferencePacket(sourcePassage) → ReferencePacket
```
A `ReferencePacket` groups results by term/phrase, includes surrounding context, and cites the source work.
---
## 4. Source Pre-Processing (integrated into Corpus Pipeline)
Many historical Arabic and Persian texts lack punctuation and paragraph segmentation. Typists and OCR processes introduce artificial page breaks and artifacts. Pre-processing is performed **at import time** as part of the corpus pipeline, since it is computationally expensive (AI-driven) and the results should be computed once and stored.
### 4.1 Segmentation Hierarchy
Segmentation proceeds bottom-up through three levels:
1. **Phrase breaks** — identify the smallest meaningful units: clause boundaries, prepositional phrases, verbal constructions, noun phrases with modifiers. This is the atomic unit of the translation system. Phrase boundaries are marked by grammatical structure, not punctuation (which may be absent).
2. **Sentence breaks** — group phrases into complete semantic statements. In Arabic/Persian, sentence boundaries are identified by structural cues: verbal clause completion, shift of grammatical subject, rhetorical pivot words (فَـ / ثمّ / أمّا / و أن), and shifts in thematic content.
3. **Paragraph breaks** — group sentences into thematic units. A new paragraph begins at a shift in topic, argument stage, addressee, or rhetorical mode (e.g. from exposition to exhortation).
Each level informs the next — you cannot reliably find paragraph breaks without first understanding sentence boundaries, and you cannot find sentence boundaries without first parsing phrase structure.
### 4.2 Pre-Processing Pipeline (runs at import)
```
Raw source text
  → OCR artifact removal (spurious line breaks, page numbers, headers/footers)
  → Unicode normalization (Arabic/Persian script variants, diacritical marks)
  → AI phrase-break identification (clause-level segmentation)
  → AI sentence-break identification (from phrase groups)
  → AI paragraph-break identification (from sentence groups)
  → Structural annotation (chapter/section markers preserved)
  → Segmented source stored in staging DB with all three levels
```
### 4.3 Segmentation Storage
```sql
CREATE TABLE source_segments (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES corpus_sources(id),
  paragraph_index INTEGER NOT NULL,
  sentence_index INTEGER NOT NULL,
  phrase_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  segment_level TEXT CHECK(segment_level IN ('phrase','sentence','paragraph')),
  -- Reconstructed text at each level (for display)
  paragraph_text TEXT,       -- full paragraph (set on paragraph-level rows)
  sentence_text TEXT,        -- full sentence (set on sentence-level rows)
  -- AI confidence
  break_confidence REAL,     -- 0-1 confidence that the break is correct
  break_rationale TEXT,      -- AI explanation for why break was placed here
  -- Offsets into original raw text
  raw_start_offset INTEGER,
  raw_end_offset INTEGER
);
CREATE INDEX idx_segments_source ON source_segments(source_id, paragraph_index, sentence_index, phrase_index);
```
### 4.4 Integration with Corpus Pipeline
Segmentation runs after alignment verification but before Meilisearch indexing:
```
Import DOCX → Stage pairs → Alignment checks → AI verification
  → Segmentation (phrase → sentence → paragraph)
  → Index to Meilisearch (with segmentation metadata)
```
For source texts that arrive as raw unsegmented blocks (not parallel DOCX pairs), the segmentation pipeline runs standalone:
**CLI command:** `ctai corpus segment <file> --lang <ar|fa> [--dry-run]`
For parallel DOCX imports, segmentation of the source column is automatic.
The translation system consumes the stored phrase-level segments directly — no re-segmentation at translation time.
---
## 5. Agent System (`packages/core`)
### 5.1 Agent Personas & Roles
Each translator agent has a named persona with specific credentials. These aren't cosmetic — the persona anchors the agent's system prompt, giving it a consistent critical voice across sessions.
**Research Agent (RA)**
- Receives source passage, runs search strategy, assembles `ReferencePacket`
- System prompt: expert in Bahá'í textual corpus, search optimization, citation
- Does NOT translate — only retrieves and organizes precedent
**Dr. Penelope Hamilton — Literary & Fidelity Lens (TA-L)**
- Oxford-based scholar in English literature and linguistics
- Specialist in Keats, Byron, Gibbon, and the King James Bible
- Doctoral dissertation on translating Nahj al-Balagha into literary English
- Primary concern: English prose quality matching Shoghi Effendi's register
- Evaluates cadence, rhythm, word choice, elevated-but-not-archaic tone
- Also flags deviations from source fidelity when literary choices drift
**Professor Reza Farid — Persian & Cultural Lens (TA-P)**
- Leading authority in Persian classical poetry and Islamic literature
- Unparalleled knowledge of Sufi terminology and literary allusions to Attar, Hafez, and Rumi
- Published extensively on Shoghi Effendi's methodology in translating the Farsi Kitáb-i-Íqán
- Primary concern: cultural context, Persian literary allusion, figurative language adaptation
- Ensures Persian idiom and poetic convention are correctly interpreted
**Dr. Ahmed Bakri — Arabic & Theological Lens (TA-T)**
- Preeminent scholar in Arabic and Islamic literature
- Expertise in Qur'anic grammar and development of Shí'ah jurisprudence
- Published on translation norms in Shoghi Effendi's rendering of Prayers and Meditations (Munáját)
- Primary concern: doctrinal precision, Qur'anic/Islamic precedent, technical terminology
- Ensures terms carry correct theological weight and Bahá'í-specific meaning
**Assembly Agent (AA)**
- Composes phrase-level translations into flowing paragraphs
- Adjusts only: word order, connectives, punctuation — flags substantive changes
- Prompted with Shoghi Effendi paragraph-level prose rhythm patterns
**Fidelity Reviewer (FR)**
- Compares assembled paragraphs against source + phrase-level rendering
- Produces diff annotations for any meaning drift introduced by assembly
### 5.2 Translation Styles
CTAI supports three distinct translation styles, selectable per job:
- **Literary** — readable, flowing prose in Shoghi Effendi's register. Default style. Prioritizes beauty and accessibility.
- **Literal** — conforms closely to original word order. Useful for study. Preserves source structure even at the cost of English naturalness.
- **Technical** — literal style with embedded original terms and transliterations inline. Useful for scholarly/technical study. E.g. "God hath singled Him out (iṣṭafáhu'lláh) and made Him the Dayspring (maṭli') of His Own Self (Nafsihi)."
Style selection affects the system prompts for all three translator agents and the assembly agent. The research agent and fidelity reviewer are style-independent.
### 5.3 Evaluation Criteria
During deliberation, agents evaluate renderings against six explicit criteria:
1. **Style** — Does it capture Shoghi Effendi's literary register?
2. **Historical Context** — Does it reflect the historical and cultural nuances of the original?
3. **Literary Allusions** — Are references to other works (Qur'án, Sufi poetry, etc.) correctly interpreted?
4. **Theological Terminology** — Do technical terms accurately reflect Islamic and Bahá'í concepts?
5. **Translation Precedent** — Does it adhere to established terminology set by Shoghi Effendi?
6. **Figurative Language Adaptation** — Are figures of speech adapted into fitting English expressions?
### 5.4 Consultation Protocol
```
Phase 1: Source Analysis
  RA analyzes source passage → extracts key terms
  RA searches corpus → builds ReferencePacket
  ReferencePacket distributed to TA-L, TA-P, TA-T
Phase 2: Independent Rendering
  TA-L, TA-P, TA-T each independently produce:
    - Phrase-by-phrase translation
    - Per-phrase rationale citing ReferencePacket entries
  (Parallel execution — no agent sees others' work)
Phase 3: Iterative Deliberation (repeat until convergence, max 3 rounds)
  Round N:
    All three renderings revealed to all agents
    Each agent critiques the other two against the six evaluation criteria:
      - Agreements (high confidence phrases)
      - Disagreements with rationale
      - Mind-changes with explanation
    Each agent re-translates contested phrases incorporating feedback
  Convergence test: if no phrases changed between rounds → exit loop
Phase 4: Convergence
  Synthesis step produces:
    - Final phrase-by-phrase rendering
    - Per-phrase confidence: 'settled' | 'contested'
    - Notes on contested phrases capturing the full deliberation history
Phase 5: Assembly
  AA composes phrases into flowing paragraphs (style-dependent)
  FR reviews assembled text against source + phrase rendering
  FR flags any drift introduced by assembly
```
### 5.5 Data Structures
```ts
interface TranslationJob {
  id: string
  sourceText: string
  sourceLang: 'ar' | 'fa'
  targetLang: 'en'               // future: 'de', 'fr', etc.
  style: 'literary' | 'literal' | 'technical'
  status: 'queued' | 'researching' | 'translating' | 'deliberating' | 'assembling' | 'complete' | 'failed'
  deliberationRound: number       // current round (max 3)
  phases: PhaseResult[]
  finalOutput: TranslationOutput
  createdAt: string
  userId: string
  cached: boolean
}
interface Phrase {
  index: number
  sourcePhrase: string
  startOffset: number   // char offset in source paragraph
  endOffset: number
}
interface PhraseRendering {
  phraseIndex: number
  rendering: string
  rationale: string
  precedents: string[]  // reference packet citation IDs
}
interface AgentRendering {
  agentRole: 'literary' | 'persian' | 'theological'
  agentName: string               // 'Dr. Hamilton' | 'Prof. Farid' | 'Dr. Bakri'
  round: number                   // deliberation round number
  phrases: PhraseRendering[]
}
interface AgentCritique {
  agentRole: string
  targetAgent: string
  agreements: number[]       // phrase indices
  disagreements: { phraseIndex: number, concern: string, suggestion: string }[]
  mindChanges: { phraseIndex: number, explanation: string }[]
}
interface FinalPhrase {
  index: number
  sourcePhrase: string
  rendering: string
  confidence: 'settled' | 'contested'
  notes: string[]           // deliberation notes from all phases
  precedents: string[]
}
interface TranslationOutput {
  phrases: FinalPhrase[]
  assembledParagraphs: string[]         // flowing English
  assembledSource: string[]             // original paragraphs
  fidelityFlags: FidelityFlag[]
  referencePacket: ReferencePacket
}
interface FidelityFlag {
  phraseIndex: number
  phraseRendering: string
  assembledText: string
  concern: string
}
```
### 5.6 Agent Provider
Abstract LLM calls behind a provider interface. Initial implementation: Anthropic Claude API (Sonnet for translators, Haiku for alignment checks). Support swapping models per agent role.
```js
// packages/core/agents/provider.js
callAgent(role, systemPrompt, messages, options) → response
```
### 5.7 Prompt Management
System prompts stored as markdown in `/prompts/` directory, version-controlled. Loaded at runtime. Structure:
```
prompts/
├── research-agent.md
├── translator-fidelity.md
├── translator-literary.md
├── translator-theological.md
├── assembly-agent.md
├── fidelity-reviewer.md
└── alignment-checker.md
```
---
## 6. Caching Layer
### 6.1 Translation Cache
Avoid re-translating identical source passages. Cache key: `hash(sourceText + sourceLang + promptVersions)`. Prompt version hash ensures cache invalidation when prompts are updated.
```sql
-- In Turso (production) or local SQLite (dev)
CREATE TABLE translation_cache (
  cache_key TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  output_json TEXT NOT NULL,  -- full TranslationOutput serialized
  created_at TEXT DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0,
  last_accessed TEXT
);
CREATE INDEX idx_cache_source ON translation_cache(source_lang, source_text);
```
### 6.2 Search Cache
Cache reference packets for repeated term searches. TTL-based (invalidate when corpus index is rebuilt).
### 6.3 Cache CLI
```
ctai cache stats
ctai cache clear [--older-than <days>]
ctai cache lookup <source-text>
```
---
## 7. REST API (`packages/api`)
Built with **Hono** (lightweight, edge-compatible).
### 7.1 Auth
- Turso-backed user table
- API key auth for programmatic access
- Session cookie auth for web app
- Stripe customer ID linked to user record
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  api_key TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free' CHECK(plan IN ('free','pro','institutional','api')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  expires_at TEXT NOT NULL
);
```
### 7.2 Public Translation Access
Completed translations are publicly readable. No auth required for read-only access to cached translations.
```sql
CREATE TABLE published_translations (
  id TEXT PRIMARY KEY,
  cache_key TEXT REFERENCES translation_cache(cache_key),
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  style TEXT NOT NULL,
  work_title TEXT,
  commissioned_by TEXT,        -- institution name for attribution
  published_at TEXT DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0
);
CREATE INDEX idx_published_lang ON published_translations(source_lang, work_title);
```
### 7.3 Endpoints
```
Auth:
  POST   /auth/register        { email, password, name }
  POST   /auth/login           { email, password } → session cookie + API key
  POST   /auth/logout
  GET    /auth/me              → user profile
Translation (requires auth — pro/institutional/api tier):
  POST   /translate            { sourceText, sourceLang, style?, options? }
                               → { jobId } (async)
  GET    /translate/:jobId     → TranslationJob (with status + partial results)
Public read access (no auth required):
  GET    /translations                        → browse all published translations
  GET    /translations/:id                    → full translation with all views
  GET    /translations/:id/report             → TranslatorReport view
  GET    /translations/:id/phrases            → PhraseStudy view
  GET    /translations/:id/reader             → ReaderView
Search (corpus browsing):
  GET    /search?q=...&lang=...&mode=...  → search results
  GET    /corpus/works                     → list indexed works
  GET    /corpus/pairs/:id                 → single pair with neighbors
Billing:
  POST   /billing/checkout     → Stripe checkout session
  POST   /billing/webhook      → Stripe webhook handler
  GET    /billing/usage        → current period usage stats
Admin (requires admin role):
  GET    /admin/corpus/flagged       → alignment review queue
  POST   /admin/corpus/pairs/:id     { status, notes }
  POST   /admin/corpus/reindex
```
### 7.3 Rate Limiting & Billing
**Economic model:** Institutions pay for new translations. Individuals read cached translations for free.
Good AI translations require many LLM passes and cost real money. The model is: organizations that need translations (National Assemblies, publishing trusts, academic departments) commission and fund the work. Once a translation is complete and cached, it is freely available to all users for individual study. The translation corpus grows over time as a shared resource.
**Tiers:**
- **Free (individual study):** Unlimited read access to all cached/completed translations (all three views, full annotations). No new translation jobs.
- **Pro (translator/scholar):** Commission new translation jobs for unstudied passages. $X/month subscription + per-job compute costs.
- **Institutional:** Volume pricing for organizations commissioning book-length translations. Custom invoicing. Priority processing.
- **API:** Programmatic access for integration with other tools. Per-job billing.
Track usage per user per billing period in Turso. Stripe handles subscriptions and per-job charges.
```sql
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  job_id TEXT,
  tokens_used INTEGER,
  cost_usd REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
```
---
## 8. CLI (`packages/cli`)
Built with **commander.js**. All commands use `packages/core` directly.
```
ctai corpus import <glob>      Import DOCX files to staging
ctai corpus check              Run alignment heuristics
ctai corpus verify             AI alignment verification
ctai corpus segment [--source-id <id>]  Run phrase/sentence/paragraph segmentation
ctai corpus review             Interactive review TUI
ctai corpus index              Export to Meilisearch
ctai corpus stats              Show corpus statistics
ctai translate <file|text>     Run translation job
  --lang <ar|fa>               Source language
  --style <literary|literal|technical>   Translation style (default: literary)
  --output <report|phrases|reader|json>
  --no-cache                   Skip cache lookup
  --max-rounds <n>             Max deliberation rounds (default: 3)
ctai search <query>            Search corpus
  --lang <ar|fa>
  --mode <bm25|semantic|hybrid>
ctai cache stats|clear|lookup  Cache management
ctai serve                     Start API server
ctai dev                       Start dev server (API + Web)
```
---
## 9. Web Application (`packages/web`)
**Astro** static shell + **Svelte** interactive islands. **Tailwind CSS** with centralized design tokens.
### 9.1 Design Tokens
```css
/* packages/web/src/styles/tokens.css */
:root {
  --color-primary: #1a5276;
  --color-primary-light: #2980b9;
  --color-secondary: #7d3c98;
  --color-accent: #d4ac0d;
  --color-bg: #fdfefe;
  --color-bg-alt: #f4f6f7;
  --color-text: #2c3e50;
  --color-text-muted: #7f8c8d;
  --color-border: #d5dbdb;
  --color-success: #27ae60;
  --color-warning: #f39c12;
  --color-error: #e74c3c;
  --color-source-highlight: #fef9e7;
  --color-target-highlight: #eaf2f8;
  --color-note-bg: #fdf2e9;
  --font-body: 'Source Serif Pro', Georgia, serif;
  --font-arabic: 'Scheherazade New', 'Traditional Arabic', serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```
Tailwind config extends with these tokens. All components reference tokens, never raw colors.
### 9.2 Pages
```
/                          Landing page — product overview, mission statement
/login, /register          Auth flows
/dashboard                 User home — recent jobs, usage stats (auth required)
/translate                 Translation workspace (auth required — pro/institutional)
  - Source input panel (with RTL support)
  - Live job status indicator
  - Output view switcher (three views below)
/translations              Public translation library — browse all completed translations (no auth)
/translations/:id          Published translation (deep-linkable, no auth required)
/translations/:id/report   Translator's Report view
/translations/:id/phrases  Phrase Study view
/translations/:id/reader   Reader's View
/corpus                    Corpus browser — search + browse indexed works
/corpus/:workId            Work detail — browse pairs by chapter
/admin/corpus              Corpus management (import status, review queue)
/billing                   Plan management, usage history
```
### 9.3 Three Output Views
All three views are publicly accessible for published translations (no auth required). The translation workspace (commissioning new translations) requires authentication and an appropriate billing tier.
**Translator's Report**
- Full deliberation record
- Per-phrase: all three agent renderings, critiques, convergence notes
- Reference packet citations inline
- Fidelity flags highlighted
- Intended audience: translators, scholars
**Phrase Study**
- Side-by-side source and translation at phrase level
- Each phrase pair is a row
- Click a phrase to expand: rationale, precedents, confidence level, notes
- Hover a source phrase → highlight corresponding target phrase (and vice versa)
- Intended audience: translation students, researchers
**Reader's View**
- Clean side-by-side paragraphs (source RTL, translation LTR)
- Hover any phrase in either column → highlight corresponding phrase in both columns
- Click a highlighted phrase → popover with brief notes
- Footnotes for contested phrases
- Intended audience: general readers, reviewers
### 9.4 Phrase Highlighting System
Critical interactive feature across Phrase Study and Reader's View.
```ts
// Each phrase carries offset mappings
interface PhraseMappings {
  phraseIndex: number
  source: { start: number, end: number }  // char offsets in source paragraph
  target: { start: number, end: number }  // char offsets in assembled translation
}
```
- Source and target text rendered with `<span data-phrase="N">` wrappers per phrase
- Svelte reactive store tracks `hoveredPhrase: number | null`
- Hover on any span → set store → all spans with matching phrase index highlight
- CSS classes: `phrase-highlight-source` / `phrase-highlight-target` using design token colors
- Smooth transitions, subtle background color, no layout shift
### 9.5 RTL Support
- Source text panels use `dir="rtl"` with appropriate font (`--font-arabic`)
- Mixed-direction layout tested across views
- Bidi isolation for inline mixed-script content
---
## 10. BDD/TDD Methodology
### 10.1 Workflow
Every feature follows this cycle:
1. Write Gherkin `.feature` file in `/features/`
2. Implement Cucumber step definitions (they fail — red state)
3. Write Vitest unit tests for the underlying logic (also red)
4. Implement code until unit tests pass (green)
5. Verify Cucumber scenarios pass (green)
6. Playwright e2e tests for web-facing features
7. Refactor
### 10.2 Feature File Organization
```
features/
├── corpus/
│   ├── import-docx.feature
│   ├── alignment-check.feature
│   ├── alignment-verify.feature
│   ├── phrase-segmentation.feature
│   ├── sentence-segmentation.feature
│   ├── paragraph-segmentation.feature
│   ├── ocr-cleanup.feature
│   ├── unicode-normalization.feature
│   └── indexing.feature
├── translation/
│   ├── research-agent.feature
│   ├── independent-rendering.feature
│   ├── iterative-deliberation.feature
│   ├── convergence.feature
│   ├── assembly.feature
│   ├── fidelity-review.feature
│   └── translation-styles.feature
├── search/
│   ├── term-search.feature
│   ├── semantic-search.feature
│   └── reference-packet.feature
├── api/
│   ├── auth.feature
│   ├── translate-endpoint.feature
│   ├── billing.feature
│   └── rate-limiting.feature
├── web/
│   ├── translate-workspace.feature
│   ├── phrase-highlighting.feature
│   ├── output-views.feature
│   ├── public-translation-library.feature
│   └── corpus-browser.feature
└── cache/
    ├── cache-hit.feature
    └── cache-invalidation.feature
```
### 10.3 Example Feature
```gherkin
Feature: Independent Rendering
  The three translator agents each produce a phrase-by-phrase
  rendering independently, without seeing each other's work.

  Background:
    Given a source passage in Arabic
    And the research agent has produced a ReferencePacket

  Scenario: All three agents produce renderings
    When the independent rendering phase executes
    Then three AgentRendering objects are produced
    And each contains a rendering for every phrase in the source
    And each phrase rendering includes a rationale

  Scenario: Agents do not see each other's work
    When the independent rendering phase executes
    Then each agent's prompt contains only the source and ReferencePacket
    And no agent's prompt contains another agent's rendering

  Scenario: Renderings cite reference packet
    When the independent rendering phase executes
    Then at least one phrase in each rendering cites a ReferencePacket entry
```
### 10.4 Test Configuration
```js
// vitest.config.js
export default {
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  }
}
// cucumber.config.js
export default {
  paths: ['features/**/*.feature'],
  require: ['tests/steps/**/*.js'],
  format: ['progress', 'html:reports/cucumber.html']
}
// playwright.config.js
export default {
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4321' },
  webServer: { command: 'npm run dev', port: 4321 }
}
```
---
## 11. Infrastructure & Deployment
### 11.1 Services
| Service | Provider | Purpose |
|---------|----------|---------|
| Turso | Turso Cloud | User auth, usage tracking, translation cache |
| Meilisearch | Self-hosted or Meilisearch Cloud | Corpus search + hybrid embeddings |
| OpenAI API | OpenAI | Embeddings (`text-embedding-3-large`) |
| Anthropic API | Anthropic | All agent LLM calls |
| Stripe | Stripe | Billing, subscriptions |
| Hosting | TBD (Fly.io, Railway, etc.) | API server + web app |
### 11.2 Environment Variables
```
TURSO_URL=
TURSO_AUTH_TOKEN=
MEILISEARCH_URL=
MEILISEARCH_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SESSION_SECRET=
NODE_ENV=development|production
```
### 11.3 Local Development
```bash
# Prerequisites: Node 20+, local Meilisearch instance
npm install
npm run dev          # starts API (port 3000) + Astro dev (port 4321)
npm run test         # vitest
npm run test:bdd     # cucumber
npm run test:e2e     # playwright
```
---
## 12. Implementation Phases
### Phase 1 — Corpus Pipeline (including Segmentation)
- DOCX parser with table extraction
- Staging SQLite database
- Automated alignment checks
- AI alignment verification
- AI segmentation pipeline (phrase → sentence → paragraph)
- Meilisearch indexing with hybrid search and segmentation metadata
- CLI commands: `corpus import`, `check`, `verify`, `segment`, `index`
- BDD specs for all corpus and segmentation features
### Phase 2 — Search & Research Agent
- Hybrid search client
- Term extraction logic
- Reference packet builder
- Context expansion (neighbor fetching)
- CLI: `search` command
### Phase 3 — Translation Agents
- Agent provider abstraction
- Named persona system prompts for all six agent roles
- Three translation styles (literary, literal, technical)
- Consultation protocol orchestrator with iterative deliberation (phases 1-5, max 3 rounds)
- Translation cache
- CLI: `translate` command with JSON output
### Phase 4 — REST API
- Hono server setup
- Auth (register, login, sessions, API keys)
- Translation endpoints (async job model)
- Search endpoints
- Rate limiting
### Phase 5 — Billing
- Stripe integration (checkout, webhooks, subscription management)
- Usage tracking and enforcement
- Billing UI pages
### Phase 6 — Web Application
- Astro project with Svelte islands
- Tailwind + design tokens
- Translation workspace (input, status, view switcher)
- Three output views with phrase highlighting
- Corpus browser
- Admin corpus review UI
### Phase 7 — Polish & Hardening
- Playwright e2e test suite
- Error handling, retry logic for API calls
- Loading states, progressive disclosure
- RTL refinement
- Accessibility audit
- Performance optimization (SSR, caching headers)
---
## 13. Key Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| API framework | Hono | Lightweight, fast, edge-ready, minimal |
| Database | Turso (libSQL) | SQLite-compatible, edge replicas, simple |
| Search | Meilisearch | Built-in hybrid search, simple ops, fast |
| Frontend | Astro + Svelte | Static-first with interactive islands, no React |
| Styling | Tailwind + CSS tokens | Centralized theming, utility-first |
| Testing | Vitest + Cucumber + Playwright | BDD-first with comprehensive coverage |
| Auth | Custom (Turso-backed) | Simple, no vendor lock-in, API key support |
| Billing | Stripe | Industry standard, subscription + usage support |
| LLM | Anthropic Claude (Sonnet) | Best-in-class for nuanced translation reasoning |
| Embeddings | OpenAI `text-embedding-3-large` | Best multilingual embedding quality |
| Prompts | Version-controlled markdown | Auditable, diffable, cache-key-hashable |
| Caching | Content + prompt hash keyed | Invalidates on prompt updates, saves cost |
---
## 14. Non-Functional Requirements
- **Latency:** Full translation job < 5 minutes for a single paragraph (agent calls are the bottleneck; parallelize where protocol allows)
- **Cache hit:** < 500ms response for cached translations
- **Search:** < 200ms for corpus queries
- **Availability:** Standard web app SLA (99.5%+)
- **Data:** All corpus data, translations, and deliberation logs persisted. Never discard intermediate agent outputs.
- **Security:** API keys hashed at rest. Session cookies httpOnly + secure. Stripe webhook signature verification. Input sanitization on all endpoints.
- **Accessibility:** WCAG 2.1 AA for web app. Proper RTL support. Keyboard navigation for phrase study.
---
## 15. Target Texts (Proof of Concept)
Initial texts planned for translation, in priority order:
1. **Bahá'u'lláh's Qasídiy-i-Varqá'íyyih** — Literary translation (Arabic poetry, high difficulty)
2. **The Báb's Dalá'il-i-Sab'ih** — Literary translation (Arabic theological treatise)
3. **Mázandarání's Zuhúru'l-Ḥaqq, Volume 1** — Literary translation (Persian historical narrative)
4. **Bahá'u'lláh's Kitáb-i-Aqdas** — Study side-by-side (Arabic, with existing authorized translation for comparison)
5. **The Báb's Arabic Bayán** — Study side-by-side (Arabic)
6. **The Báb's Qayyúmu'l-Asmá'** — Study side-by-side (Arabic)
These texts span a range of difficulty, genre, and source language, providing a comprehensive test of the system's capabilities.
---
## 16. Future: Multi-Language Output
Initial release targets English output only. Architecture supports future expansion to other target languages (German, French, Spanish, etc.) by:
- Adding target-language-specific assembly agents with appropriate literary style models
- Extending `TranslationJob.targetLang` enum
- Maintaining the same deliberation protocol (which operates on meaning, not target language)
- Separate caching per source+target+style combination