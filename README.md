# CTAI — Committee Translation AI

### *A virtual translation committee modeled on the art of Shoghi Effendi*
### *— for those who know, the name is a quiet nod to what came before*

---

## The Problem That Kept Translators Up at Night

Imagine you are translating a newly published Tablet of Bahá'u'lláh. You encounter the Arabic phrase **مظهر ظهور** (*Maẓhar-i-Ẓuhúr*). You know this means, roughly, "the place where something becomes manifest" — but how do you render it in English?

You could write "appearance." You could write "embodiment." A theologian might suggest "theophany." But Shoghi Effendi — the Guardian of the Bahá'í Faith and its appointed interpreter, who spent decades refining the English voice of the Bahá'í Revelation — chose **"Manifestation."**

Why? Because "Manifestation" carries both the philosophical weight of the Latin *manifestare* (to make palpable, to reveal to the senses) and the theological precision of something hidden becoming visible — which is exactly what ظهور (*Ẓuhúr*) means. It simultaneously resonates with Christian theological vocabulary (making it accessible to Western readers) while preserving the Islamic philosophical substrate of the original. And he used it *consistently*, across thousands of pages, building a terminology so precise that a single English word could unlock the meaning of an entire Arabic concept.

That kind of decision — multiplied by tens of thousands of phrases across the Kitáb-i-Íqán, the Kitáb-i-Aqdas, Gleanings, The Dawn-Breakers, and dozens of other works — is what makes Shoghi Effendi's translations not merely accurate but *architecturally coherent*. Every word choice reinforces every other word choice. The vocabulary is a system.

**And translators working on new texts need access to that entire system.**

For years, a piece of DOS software — written in the late 1980s and early 1990s to support the translation of the Kitáb-i-Aqdas — provided phrase-by-phrase access to Shoghi Effendi's translation corpus. It was a concordance that let translators look up how the Guardian rendered any given Arabic or Persian term. It was indispensable. But it was a reference tool, not a collaborator. It could show you what Shoghi Effendi did. It couldn't help you reason about *why* he did it, or how to extend his choices to passages he never translated.

CTAI is the answer to that gap.

---

## What CTAI Actually Does

CTAI assembles a **virtual translation committee** — a team of AI agents, each specializing in a different dimension of the translation challenge, working together through a structured consultation process modeled on how real Bahá'í translation committees operate.

Here's what happens when you submit a passage for translation:

### 0. Source Pre-Processing (done at import, not translation time)

Many historical Arabic and Persian texts lack punctuation and paragraph breaks entirely. Typists and OCR processes introduce their own artifacts — spurious page breaks, mangled diacritical marks, merged paragraphs. CTAI handles this as part of the corpus import pipeline, not at translation time, because it's computationally expensive and should only be done once.

The segmentation works bottom-up through three levels — and this hierarchy matters:

First, **phrase breaks**: the smallest meaningful units. Clause boundaries, prepositional phrases, verbal constructions. In a language with no punctuation, you can't find where a sentence ends until you understand where its phrases are.

Then, **sentence breaks**: grouping phrases into complete semantic statements. Arabic and Persian signal sentence boundaries through structural cues — completion of a verbal clause, shift of grammatical subject, rhetorical pivot words like فَـ (*fa-*), ثمّ (*thumma*), أمّا (*ammá*).

Finally, **paragraph breaks**: grouping sentences into thematic units. A new paragraph begins where the topic shifts, the argument moves to a new stage, the addressee changes, or the rhetorical mode pivots from exposition to exhortation.

Each level informs the next. You cannot reliably find paragraph breaks without first understanding sentence boundaries, and you cannot find sentence boundaries without first parsing phrase structure. The stored segmentation feeds directly into the translation pipeline — the phrases identified here become the atomic units that the translator agents work with.

### 1. The Research Agent Searches the Corpus

Before any translation begins, a dedicated Research Agent analyzes your source passage and identifies every theologically significant term, literary device, and structural pattern. It then searches the complete indexed corpus of Shoghi Effendi's translations — using both exact keyword matching and semantic similarity — to assemble a **Reference Packet**: a dossier of every relevant precedent, organized by term, with full surrounding context.

For example, if your passage contains **عرفان** (*Irfán*), the Research Agent would find that Shoghi Effendi rendered this word differently depending on context: as "knowledge" when it appears in a general epistemological sense, as "recognition" when it refers to recognizing the Manifestation of God, and as "true understanding" when it carries a mystical connotation. The Reference Packet would include all of these instances with their surrounding paragraphs, so the translators can see *which sense applies to your passage*.

### 2. Three Translators Work Independently — Meet the Committee

Three translator agents each produce their own phrase-by-phrase rendering of the source text. Crucially, they work **independently** — none of them sees the others' work. This prevents groupthink and ensures genuine diversity of perspective.

Each agent is a named persona with specific credentials — not cosmetic decoration, but anchors that give each agent a consistent critical voice. Think of them as the committee members you'd dream of having around the table. And because each persona persists across every translation job, their critical voices develop coherence — Dr. Hamilton's literary instincts don't shift between chapters, Professor Farid's cultural readings build on consistent principles, and Dr. Bakri's theological precision is reliably rigorous.

**👩‍🎓 Dr. Penelope Hamilton — Literary & Fidelity Lens**

An Oxford-based scholar in English literature and linguistics, with a focus on Keats, Byron, Gibbon, and the King James Bible. Her doctoral dissertation treated the challenges of translating Alí ibn Abí Ṭálib's "Nahj al-Balághih" into appropriate literary English. She brings a sweeping knowledge of classical English vocabulary and expression. When the Arabic says **سدرة المنتهى** (*Sidrat'ul-Muntahá* — literally, "the Lote-Tree beyond which there is no passing"), Dr. Hamilton ensures the rendering captures the Qur'anic reference (Súrih 53:14), the cosmological meaning (the boundary of the knowable), and the grammatical structure of the original — while also flagging any deviation from literal meaning, even when that deviation improves readability.

**👨‍🏫 Professor Reza Farid — Persian & Cultural Lens**

A leading authority in Persian classical poetry and Islamic literature. Professor Farid offers an unparalleled understanding of the cultural and historical contexts of Persian texts — especially Sufi terminology and literary allusions to classic poets such as 'Aṭṭár, Ḥáfiẓ, and Rúmí. He has written at length on the specific methodology employed by Shoghi Effendi in his standard-setting translation of the Farsi Kitáb-i-Íqán. His insights are crucial for maintaining the layered meaning of literary works and ensuring Persian idiom and poetic convention are correctly interpreted.

**👨‍🎓 Dr. Ahmed Bakri — Arabic & Theological Lens**

A preeminent scholar in the field of Arabic and Islamic literature, with specific expertise in Qur'ánic grammar and the development of Shí'ah jurisprudence. His detailed studies of Shoghi Effendi's Arabic translations make him a key member of the team — he has written specifically on the technical translation norms employed by Shoghi Effendi in his English rendering of *Prayers and Meditations by Bahá'u'lláh* (Munáját). When Bahá'u'lláh uses a term like **تقلید** (*Taqlíd*), a reader with only a dictionary would translate it as "imitation." But in Islamic jurisprudence, *Taqlíd* carries a specific and deeply negative connotation — the uncritical acceptance of religious authority without independent investigation. This is why Shoghi Effendi rendered it as **"blind imitation"** — adding an adjective that isn't in the original Arabic because the Arabic *already implies it* to any educated reader. Dr. Bakri catches these layers of meaning that hide inside single words.

### 3. The Committee Deliberates — Iteratively

Now comes the heart of the process. All three renderings are revealed, and each agent critiques the other two against six explicit evaluation criteria: **style**, **historical context**, **literary allusions**, **theological terminology**, **translation precedent**, and **figurative language adaptation**. They identify:

- **Agreements** — phrases where all three independently chose the same rendering (high confidence)
- **Disagreements** — phrases where they diverged, with detailed reasoning about why
- **Mind-changes** — places where seeing another agent's rendering changed their own thinking

Then — and this is critical — each agent **re-translates** the contested phrases, incorporating the feedback. The committee reconvenes and repeats the cycle. This continues for up to three rounds, or until no phrases change between rounds. Just as in real Bahá'í consultation, truth emerges not from any single perspective but from the *iterative clash and synthesis* of diverse viewpoints offered with detachment.

### 4. Convergence

A synthesis step produces the final phrase-by-phrase translation. Each phrase gets a confidence level — "settled" (all three agreed or converged) or "contested" (genuine disagreement remained) — along with notes capturing the deliberation. These notes are often as valuable as the translation itself, because they make the *reasoning* visible.

### 5. Assembly and Review

Phrase-level accuracy is necessary but not sufficient. Shoghi Effendi's translations don't read like interlinear glosses — they read like *literature*. An Assembly Agent takes the settled phrases and composes them into flowing paragraphs, making only the adjustments needed for natural English prose: word order, connective particles, punctuation. A Fidelity Reviewer then checks the assembled text against the source, flagging anywhere the assembly introduced drift from the intended meaning.

---

## A Concrete Example

Consider the Arabic phrase from the Kitáb-i-Íqán:

**قد اصطفاه الله و جعله مطلعاً لنفسه**

(*Qad'iṣṭafáhu'lláh va ja'alahu maṭli'an li-Nafsihi*)

A literal gloss might give you: "God has chosen him and made him a dawning-place for His Self."

Here's what CTAI's committee process might surface:

- **Research Agent** finds that Shoghi Effendi consistently renders **مطلع** (*Maṭli'*) with the metaphor of dawning — "Dayspring," "Day Star," "Dawning-place" — preserving the solar imagery that pervades Bahá'u'lláh's Arabic. It also finds that **اصطفی** (*Iṣṭafá*) appears across multiple works and is rendered as "chosen" in some contexts and "singled out" in others.

- **Dr. Hamilton** proposes: "God hath chosen Him and made Him the Dawning-place of His Own Self" — preserving the grammatical structure and every semantic unit.

- **Professor Farid** proposes: "God hath singled Him out and made Him the Dayspring of His Self" — noting that "singled out" carries more rhetorical weight than "chosen" and that "Dayspring" is Shoghi Effendi's most characteristic rendering of this root.

- **Dr. Bakri** notes that **نفس** (*Nafs*) here doesn't mean "self" in the colloquial sense but refers to the Divine Essence as it manifests in creation — a distinction with major doctrinal implications. Suggests "His Own Self" with the emphatic "Own" to signal this isn't casual self-reference.

The committee converges on: **"God hath singled Him out and made Him the Dayspring of His Own Self"** — with notes explaining why "Dayspring" was preferred over "Dawning-place" (six precedents in Gleanings alone) and why "Own" was added (theological precision).

---

## Three Ways to Read the Output

CTAI produces three distinct views of every translation, each designed for a different audience. Once a translation has been commissioned and completed, all three views are **freely available** to anyone — no account required, no paywall. The institution that funded the translation has already paid the compute cost; the result belongs to everyone.

### 📜 Translator's Report
The full deliberation record. Every phrase shows all three agent renderings, every critique, every precedent citation, every note. This is the working document for a professional translation committee — the equivalent of the minutes from a five-hour meeting compressed into a structured, searchable format.

### 🔍 Phrase Study
A side-by-side interactive view where each source phrase is paired with its final rendering. Click any phrase to expand its history: why this word was chosen, what alternatives were considered, which Shoghi Effendi precedents informed the decision. Hover over a phrase in either language and its counterpart highlights in the other column. This is the spiritual successor to that old DOS concordance tool — but one that shows you not just *what* but *why*.

### 📖 Reader's View
A clean, beautiful side-by-side presentation of the source text and assembled translation. The source flows right-to-left in elegant Arabic or Persian script; the English flows left-to-right in a serif typeface chosen to echo the feel of printed Bahá'í texts. Hover over any phrase and its partner illuminates softly in the opposite column. Click for a brief note. This is what you'd show to someone who simply wants to read and appreciate the translation.

---

## Three Translation Styles

Beyond the three views, CTAI supports three distinct **translation styles** — each serving a different purpose:

**Literary** — the default. Flowing, readable prose in the elevated-but-not-archaic register of Shoghi Effendi. This is what you'd publish.

**Literal** — conforms closely to the original word order, even at the cost of English naturalness. Useful for study, especially when you want to see how the source language structures its ideas.

**Technical** — a literal rendering with original terms and transliterations embedded inline. For scholarly and technical study. For example: *"God hath singled Him out (iṣṭafáhu'lláh) and made Him the Dayspring (maṭli') of His Own Self (Nafsihi)."*

The style selection affects how all three translator agents approach their work and how the assembly agent composes the final paragraphs — but the deliberation process remains the same.

---

## A Sample: The Báb's Commentary on the Súrih of Kawthar

To make this concrete, here's a sample of the kind of phrase-by-phrase output CTAI produces, shown in Technical style with notes:

| Original Phrase | Translation | Notes |
|---|---|---|
| بسم اللّه الرحمن الرحيم | In the Name of God, the Merciful, the Compassionate | الرحمن الرحيم (*ar-Raḥmán ar-Raḥím*) — following Shoghi Effendi and the King James Bible tradition. Conveys nuances of 'the Most Gracious' and 'the Most Merciful'. |
| الحمد للّه الذي جعل طراز | All praise be to God, who hath fashioned | الحمد للّه (*al-Ḥamdu li'lláh*) — "All praise be to God," following Shoghi Effendi's rendering in Bahá'u'lláh's Writings. جعل طراز (*ja'ala ṭiráz*) — "fashioned" captures the spirit of creation in context. |
| كتاب الفلق | the Book of the Dawn | كتاب الفلق (*Kitáb al-Falaq*) — translated using biblical resonance following Shoghi Effendi's tradition of rendering Islamic concepts with scriptural English. |
| الأزل الذي لاحت وأضائت | the Eternal One who hath appeared and shone forth | الأزل (*al-Azal*) — "the Eternal One" preserves theological weight. لاحت وأضائت (*láḥat va aḍá'at*) — evokes the imagery of divine revelation and illumination. |
| بين كل شيء نور شمس الأزل | between all things, the light of the Sun of the Eternity | شمس الأزل (*Shams al-Azal*) — "Sun of the Eternity" is a symbol for the divine source of spiritual illumination. Solar metaphor preserved. |

---

## Target Texts

CTAI is being developed against a set of specific texts spanning a range of difficulty, genre, and source language:

- **Bahá'u'lláh's Qasídiy-i-Varqá'íyyih** — Arabic poetry of extraordinary difficulty
- **The Báb's Dalá'il-i-Sab'ih** (*The Seven Proofs*) — Arabic theological treatise
- **Mázandarání's Zuhúru'l-Ḥaqq, Volume 1** — Persian historical narrative
- **Bahá'u'lláh's Kitáb-i-Aqdas** — Study side-by-side (with existing authorized translation for comparison/validation)
- **The Báb's Arabic Bayán** — Study side-by-side
- **The Báb's Qayyúmu'l-Asmá'** — Study side-by-side

---

## The Economics of Sacred Translation

Let's be honest about costs: a good AI translation is not cheap. The multi-agent deliberation process — with independent renderings, iterative critique, assembly, and fidelity review — requires many passes through large language models. A single paragraph might involve a dozen or more API calls. A full book-length work could run into hundreds of dollars.

But here's the thing: **a translation only needs to be done once.**

The model is simple. Institutions and organizations that need translations — Bahá'í National Spiritual Assemblies, publishing trusts, academic departments, translation committees — commission and fund the work. They pay the compute cost for the multi-agent deliberation, review the output, and approve the result. That translation then enters the cache permanently.

Once a translation exists, **it's available freely for individual study.** A student in Lagos, a devotional group in Pune, a study circle in Santiago — they all get access to cutting-edge translations without paying for the same work again. The cached translation serves instantly (under 500ms), costs nothing to retrieve, and carries the full phrase-level annotation, deliberation notes, and precedent citations that the original commission produced.

This means the corpus of available translations grows over time. Every institution that commissions a translation contributes to a shared resource that benefits everyone. The people who most need access to these texts — individual believers studying the Writings in their homes — are exactly the people who shouldn't have to bear the cost of producing them.

The pricing tiers reflect this:

- **Institutional / API access** — pay per translation job (the real cost of compute)
- **Individual study access** — free for all cached/completed translations
- **Pro tier** — for translators and scholars who need to commission their own translations of unstudied passages

---

## Why Not Just Prompt a Single AI?

A fair question. Modern language models *can* translate Arabic and Persian. But they have three critical weaknesses for this specific task:

**1. Training noise.** LLMs have been trained on millions of translations of varying quality. When you ask for a translation, you get an average — a rendering influenced by every amateur, every machine translation, every divergent scholarly tradition in the training data. Shoghi Effendi's translations are a tiny fraction of that corpus, and their distinctive voice is drowned out by sheer volume.

**2. Context window limits.** Shoghi Effendi's complete translations span thousands of pages. You cannot fit them into a context window. But you *can* index them in a search engine and retrieve exactly the relevant precedents for any given passage. This is what the Research Agent does — it gives the translators access to the full corpus without needing to fit it in memory.

**3. Single-perspective blindness.** A single prompt produces a single rendering with a single set of biases. The multi-agent deliberation process surfaces tensions that a single model would silently resolve — often incorrectly. When Dr. Hamilton and Dr. Bakri disagree, that disagreement *is the information*. It tells you exactly where the hard decisions are.

---

## Architecture at a Glance

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  DOCX Files │────▶│  Corpus Pipeline │────▶│  Meilisearch │
│  (parallel  │     │  Parse → Stage → │     │  BM25 +      │
│   text)     │     │  Verify → Index  │     │  Semantic     │
└─────────────┘     └─────────────────┘     └──────┬───────┘
                                                    │
┌─────────────┐     ┌─────────────────┐             │
│ Source Text  │────▶│  Pre-Processor   │             │
│ (ar / fa)   │     │  Clean → Segment │             │
└─────────────┘     └────────┬────────┘             │
                             │                       │
                             ▼                       │
            ┌────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│                   Research Agent                          │
│  Analyzes source → Extracts terms → Searches corpus      │
│  Builds Reference Packet with precedents + context       │
└────────────────────────┬─────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │    Dr.     │ │   Prof.    │ │    Dr.     │
   │  Hamilton  │ │   Farid    │ │   Bakri    │
   │ (Literary) │ │ (Persian)  │ │(Theological│
   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
         │  Independent rendering phase  │
         └──────────┬───────────────────┘
                    ▼
          ┌───────────────────┐
          │   Deliberation    │◄──┐
          │  Compare → Critique│   │ Up to 3
          │  → Re-translate   │───┘ rounds
          └────────┬──────────┘
                   ▼
          ┌───────────────────┐
          │  Assembly Agent   │
          │  Phrases → Prose  │
          │  (style-specific) │
          └────────┬──────────┘
                   ▼
          ┌───────────────────┐
          │ Fidelity Reviewer │
          │  Check for drift  │
          └────────┬──────────┘
                   ▼
          ┌───────────────────┐
          │   Three Output    │
          │      Views        │
          │ Report │ Phrases  │
          │    │ Reader       │
          └───────────────────┘
```

**Tech stack:** Node.js · ES6 modules · Hono (API) · Astro + Svelte (web) · Tailwind CSS · Turso (auth + cache) · Meilisearch (corpus search) · Anthropic Claude (agents) · OpenAI embeddings · Stripe (billing)

---

## The Corpus

CTAI is powered by a carefully prepared index of Shoghi Effendi's complete translations, parsed from side-by-side bilingual documents and indexed at both paragraph and phrase levels. The corpus pipeline includes:

- **DOCX parsing** with table-structure extraction and column-alignment verification
- **Automated alignment checks** — script detection, length ratios, structural validation
- **AI-assisted verification** — an LLM reviews flagged pairs and a random sample to catch misalignments that heuristics miss
- **Hybrid search indexing** — every passage is searchable by exact keyword (BM25) and by meaning (semantic embeddings), so the Research Agent can find both terminological matches and conceptual parallels
- **Phrase-level segmentation** — source texts are pre-segmented at import into phrases, sentences, and paragraphs, so the translation pipeline receives ready-to-translate atomic units without re-computing expensive segmentation at runtime

This means when the Research Agent searches for how Shoghi Effendi handled **مشرق الأذکار** (*Mashriqu'l-Adhkár*), it finds not only the direct rendering ("Dawning-place of the remembrance of God") but also every passage where related solar/dawn imagery appears — giving the translator agents a rich web of stylistic context, not just a dictionary entry.

---

## The Name

**CTAI** stands for *Committee Translation AI* — a name that describes exactly what it does. For those who remember a certain DOS-based concordance tool from the early '90s, the acronym may carry an extra resonance. That's intentional.

But where the old tool was a static reference — a window into Shoghi Effendi's word choices — CTAI is a dynamic collaborator. It doesn't merely show you what Shoghi Effendi wrote. It helps you understand *why* he wrote it that way, and how to extend his vision to passages he never had the chance to translate himself.

---

## Interfaces

CTAI can be used three ways:

- **CLI** — for corpus management, batch translation jobs, and search queries from the terminal
- **REST API** — for programmatic access, integration with other tools, and building custom workflows
- **Web Application** — an interactive translation workspace with real-time job tracking, the three output views, and a corpus browser for exploring Shoghi Effendi's translations directly

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/immersive-ocean/ctai.git
cd ctai

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys (Anthropic, OpenAI, Turso, Meilisearch, Stripe)

# Import corpus documents
ctai corpus import "./corpus/**/*.docx"

# Run alignment checks
ctai corpus check
ctai corpus verify

# Index to Meilisearch
ctai corpus index

# Run segmentation on imported corpus (phrase → sentence → paragraph)
ctai corpus segment

# Translate a passage (literary style, default)
ctai translate "your source text here" --lang ar --output report

# Translate in technical style with inline terms
ctai translate ./passage.txt --lang fa --style technical --output phrases

# Start the web application
ctai dev
# Visit http://localhost:4321
```

---

## Development

CTAI follows a strict BDD/TDD methodology. Every feature begins as a Gherkin specification, becomes a failing test, and is then implemented until green.

```bash
npm run test          # Vitest unit + integration tests
npm run test:bdd      # Cucumber/Gherkin behavioral specs
npm run test:e2e      # Playwright browser tests
npm run test:all      # Everything
```

See the [PRD](./docs/CTAI-PRD.md) for full technical specifications, data schemas, agent protocols, and implementation phases.

---

## A Note on Aspiration

Shoghi Effendi once described translation as an art that requires "an intimate knowledge of the spirit and content of the original, as well as a mastery of the language into which the work is to be translated." CTAI does not replace that intimate knowledge. No AI can fully grasp the spiritual weight of sacred text, or the cultural resonance that a lifetime of devotion brings to the act of translation.

What CTAI offers is *infrastructure for that devotion* — a way to bring the full breadth of Shoghi Effendi's translation decisions to bear on every new phrase, to ensure that no precedent is overlooked, no nuance is lost to the limits of human memory, and no translator works alone when they could be working in consultation.

The translation itself remains a profoundly human responsibility. CTAI simply ensures that the human translator has the best possible foundation on which to build.

---

<p align="center"><em>Built with reverence for the original texts and deep respect for those who dedicate their lives to making them accessible.</em></p>

<p align="center">
  <strong>Immersive Ocean Inc.</strong><br/>
  A project of <a href="https://oceanlibrary.com">OceanLibrary.com</a>
</p>