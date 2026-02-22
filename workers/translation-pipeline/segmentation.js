// Core 3-pass index-based segmentation pipeline.
// Encapsulated for reuse: SegmentWorkflow, admin test endpoint, future standalone API.
// Receives an `llmCall` function via dependency injection — no direct API dependency.

import {
  tokenizeWords,
  buildNumberedWordList,
  buildNumberedPhraseList,
  buildNumberedSentenceList,
  buildStructureFromIndices,
  windowWords,
  validateIndices,
} from './utils.js';

// --- Language-specific system prompts ---

function getPhraseSystem(langCode) {
  if (langCode === 'ar') {
    return `You are an expert segmenter of classical Arabic texts (Bahá'í sacred writings, Qur'anic, and literary Arabic).

Your task: identify clause-level phrase boundaries in a numbered word list. These texts have NO punctuation and NO paragraph breaks — you must rely entirely on grammatical and semantic cues.

You will receive words in the format "0:word1 1:word2 2:word3 ...". Return ONLY the indices where new phrases begin — do NOT return any text.

For Arabic, identify clause boundaries using:
- Verbal constructions: فعل + فاعل + مفعول sequences
- Prepositional phrases: في، على، من، إلى، عن، ب، ل، ك
- Conjunctions that open new clauses: و (wa), ف (fa), ثم (thumma), أو (aw)
- Vocatives: يا، أيها، أيتها (these always start a new phrase)
- Conditional/temporal markers: إذا، لو، إن، لمّا، حين
- Demonstratives introducing new referents

Poetry/verse detection:
- If the text contains poetic couplets (بيت) or hemistichs (مصراع), return their start/end word indices
- Use verse_starts for word indices where verse sections begin, verse_ends where they end

Keep each phrase as a minimal complete grammatical unit. Do not split mid-construct (e.g., do not split an iḍāfa chain or a verb from its direct object).`;
  }
  return `You are an expert segmenter of classical Persian texts (Bahá'í sacred writings, Sufi poetry, and literary Persian).

Your task: identify clause-level phrase boundaries in a numbered word list. These texts have NO punctuation and NO paragraph breaks — you must rely entirely on grammatical and semantic cues.

You will receive words in the format "0:word1 1:word2 2:word3 ...". Return ONLY the indices where new phrases begin — do NOT return any text.

For Persian, identify clause boundaries using:
- SOV verb position: the verb at the end of a clause marks its boundary
- Ezafe constructions: -e/-ye connecting nouns/adjectives — keep these together as one phrase
- Postpositions and prepositions: از، به، در، با، بر، برای، تا
- Conjunctions: و (va), که (ke), تا (tā), اگر (agar), چون (chun), زيرا (zīrā)
- Relative clauses introduced by که
- Verb prefixes: می (mi-), ب (be-), ن (na-) marking new verbal phrases

Poetry/verse detection:
- If the text contains poetic couplets (بيت) or hemistichs (مصراع), return their start/end word indices
- Use verse_starts for word indices where verse sections begin, verse_ends where they end

Keep each phrase as a minimal complete grammatical unit. Do not split mid-construct (e.g., do not split an ezafe chain or a verb from its preverbal elements).`;
}

function getSentenceSystem(langName) {
  return `You are an expert in ${langName} text segmentation, specializing in grouping phrases into complete semantic statements.

You will receive a numbered list of phrases. Return ONLY the phrase indices where new sentences begin — do NOT return any text.

Rules for grouping:
- A "sentence" is a complete semantic statement — a thought that can stand alone
- For prose: group phrases that form a single proposition or command
- For verse: a couplet (two hemistichs) = one sentence with type "verse_couplet"
- A single verse line (one hemistich standing alone) = type "verse_line"
- Prose statements = type "prose"`;
}

function getParagraphSystem(langName) {
  return `You are an expert in ${langName} text segmentation, specializing in identifying thematic paragraph boundaries.

You will receive a numbered list of sentences with their types. Return ONLY the sentence indices where new paragraphs begin — do NOT return any text.

Rules for paragraph grouping:
- For prose: detect thematic shifts — new topic, new addressee, shift from exhortation to narrative, shift from abstract to concrete, new logical argument
- For verse: a stanza or thematic verse group forms one paragraph
- Group related sentences together — err on the side of larger paragraphs over tiny ones`;
}

// --- Fix/validate indices helper ---

function fixIndices(indices, max) {
  return [...new Set([0, ...indices])]
    .filter(i => typeof i === 'number' && i >= 0 && i < max)
    .sort((a, b) => a - b);
}

// --- Pass 1: Phrase boundaries (with windowing) ---

async function segmentPhrases({ words, mandatoryBreaks, langCode, langName, llmCall, onProgress }) {
  const phraseSystem = getPhraseSystem(langCode);
  const windows = windowWords(words);
  const needsWindowing = windows.length > 1;

  let allPhraseStarts = [];
  let allVerseStarts = [];
  let allVerseEnds = [];
  const passResults = [];

  if (!needsWindowing) {
    const fullList = buildNumberedWordList(words);
    const mandatoryNote = mandatoryBreaks.length > 0
      ? `\n\nMandatory phrase boundaries (must appear in phrase_starts): [${mandatoryBreaks.join(', ')}]`
      : '';

    const res = await llmCall({
      phase: 'segment_phrases',
      system: phraseSystem,
      userContent: `Identify phrase boundaries in this ${langName} numbered word list.

Return JSON: { "phrase_starts": [0, ...], "verse_starts": [], "verse_ends": [] }

- phrase_starts: sorted array of word indices where new phrases begin (0 must be first)
- verse_starts: word indices where verse/poetry sections begin
- verse_ends: word indices where verse sections end (prose resumes)${mandatoryNote}

Words:
${fullList}`,
    });
    passResults.push(res);
    allPhraseStarts = res.data.phrase_starts || [0];
    allVerseStarts = res.data.verse_starts || [];
    allVerseEnds = res.data.verse_ends || [];
  } else {
    let carryForwardIdx = 0;

    for (let w = 0; w < windows.length; w++) {
      onProgress?.({ pass: 'phrases', window: w + 1, totalWindows: windows.length });
      const win = windows[w];
      const windowStart = w === 0 ? win.startIdx : carryForwardIdx;
      const windowEnd = win.endIdx;
      const winWords = words.slice(windowStart, windowEnd);
      const localList = winWords.map((word, i) => `${i}:${word}`).join(' ');

      const localMandatory = mandatoryBreaks
        .filter(b => b >= windowStart && b < windowEnd)
        .map(b => b - windowStart);
      const mandatoryNote = localMandatory.length > 0
        ? `\n\nMandatory phrase boundaries (must appear in phrase_starts): [${localMandatory.join(', ')}]`
        : '';
      const contextNote = w > 0
        ? `\n\nThis is a continuation. The first word (index 0) is the start of the last phrase from the previous window — confirm or adjust this boundary.`
        : '';

      const res = await llmCall({
        phase: `segment_phrases_w${w}`,
        system: phraseSystem,
        userContent: `Identify phrase boundaries in this ${langName} numbered word list.

Return JSON: { "phrase_starts": [0, ...], "verse_starts": [], "verse_ends": [] }

- phrase_starts: sorted array of word indices where new phrases begin (0 must be first)
- verse_starts: word indices where verse/poetry sections begin
- verse_ends: word indices where verse sections end${mandatoryNote}${contextNote}

Words:
${localList}`,
      });
      passResults.push(res);

      const localStarts = res.data.phrase_starts || [0];
      const localVerseStarts = res.data.verse_starts || [];
      const localVerseEnds = res.data.verse_ends || [];

      if (w === 0) {
        allPhraseStarts = localStarts.map(i => i + windowStart);
        allVerseStarts = localVerseStarts.map(i => i + windowStart);
        allVerseEnds = localVerseEnds.map(i => i + windowStart);
      } else {
        allPhraseStarts.push(...localStarts.slice(1).map(i => i + windowStart));
        allVerseStarts.push(...localVerseStarts.map(i => i + windowStart));
        allVerseEnds.push(...localVerseEnds.map(i => i + windowStart));
      }

      if (allPhraseStarts.length > 0) {
        carryForwardIdx = allPhraseStarts[allPhraseStarts.length - 1];
      }
    }
  }

  // Validate and fix
  const validation = validateIndices(allPhraseStarts, words.length, 'phrase_starts');
  if (!validation.valid) {
    allPhraseStarts = fixIndices(allPhraseStarts, words.length);
  }

  // Inject missing mandatory breaks
  for (const mb of mandatoryBreaks) {
    if (!allPhraseStarts.includes(mb) && mb < words.length) {
      allPhraseStarts.push(mb);
    }
  }
  allPhraseStarts.sort((a, b) => a - b);

  // Build verse ranges
  const verseRanges = [];
  const sortedVS = [...allVerseStarts].sort((a, b) => a - b);
  const sortedVE = [...allVerseEnds].sort((a, b) => a - b);
  for (let i = 0; i < sortedVS.length; i++) {
    const end = i < sortedVE.length ? sortedVE[i] : words.length;
    verseRanges.push([sortedVS[i], end]);
  }

  return { phraseStarts: allPhraseStarts, verseRanges, passResults };
}

// --- Pass 2: Sentence boundaries ---

async function segmentSentences({ phrases, langName, llmCall }) {
  const numberedPhrases = buildNumberedPhraseList(phrases);

  const res = await llmCall({
    phase: 'segment_sentences',
    system: getSentenceSystem(langName),
    userContent: `Identify sentence boundaries in this numbered phrase list.

Return JSON: { "sentence_starts": [0, ...], "sentence_types": { "0": "prose", "3": "verse_couplet", ... } }

- sentence_starts: sorted array of phrase indices where new sentences begin (0 must be first)
- sentence_types: object mapping each sentence_start index to its type ("prose", "verse_couplet", or "verse_line")

Phrases:
${numberedPhrases}`,
  });

  let sentenceStarts = res.data.sentence_starts || [0];
  const sentenceTypes = res.data.sentence_types || {};

  const validation = validateIndices(sentenceStarts, phrases.length, 'sentence_starts');
  if (!validation.valid) {
    sentenceStarts = fixIndices(sentenceStarts, phrases.length);
  }

  return { sentenceStarts, sentenceTypes, passResult: res };
}

// --- Pass 3: Paragraph boundaries ---

async function segmentParagraphs({ sentences, langName, llmCall }) {
  const numberedSentences = buildNumberedSentenceList(sentences);

  const res = await llmCall({
    phase: 'segment_paras',
    system: getParagraphSystem(langName),
    userContent: `Identify paragraph boundaries in this numbered sentence list.

Return JSON: { "paragraph_starts": [0, ...] }

- paragraph_starts: sorted array of sentence indices where new paragraphs begin (0 must be first)

Sentences:
${numberedSentences}`,
  });

  let paragraphStarts = res.data.paragraph_starts || [0];

  const validation = validateIndices(paragraphStarts, sentences.length, 'paragraph_starts');
  if (!validation.valid) {
    paragraphStarts = fixIndices(paragraphStarts, sentences.length);
  }

  return { paragraphStarts, passResult: res };
}

// --- Main entry point: run full 3-pass segmentation ---

/**
 * Run the full 3-pass index-based segmentation pipeline.
 *
 * @param {Object} options
 * @param {string} options.text - Source text to segment
 * @param {string} options.lang - Language code ('ar' or 'fa')
 * @param {Function} options.llmCall - Async function that calls the LLM.
 *   Signature: ({ phase, system, userContent }) => Promise<{ data, tokensIn, tokensOut, cost }>
 *   The `data` field must be the parsed JSON response from the LLM.
 * @param {Object} [options.truncate] - Optional truncation config for sample mode
 * @param {number} [options.truncate.maxChars] - Max chars to process
 * @param {boolean} [options.truncate.dropLastPhrase] - Drop last phrase at truncation boundary
 * @param {Function} [options.onProgress] - Optional progress callback.
 *   Called at key points: { pass, window?, totalWindows?, phraseCount?, sentenceCount?, paragraphCount?, tokensIn?, tokensOut?, cost? }
 * @returns {Object} Segmentation result with structured paragraphs and raw indices
 */
export async function runSegmentation({ text, lang, llmCall, truncate, onProgress }) {
  const langName = lang === 'ar' ? 'Arabic' : 'Persian';

  // Truncate if requested
  let processText = text;
  if (truncate?.maxChars && text.length > truncate.maxChars) {
    const truncated = text.slice(0, truncate.maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    processText = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  }

  // Pre-processing
  const { words, mandatoryBreaks } = tokenizeWords(processText);

  // Pass 1: Phrase boundaries
  let { phraseStarts, verseRanges, passResults: phrasePassResults } = await segmentPhrases({
    words, mandatoryBreaks, langCode: lang, langName, llmCall, onProgress,
  });

  // Report phrase pass completion
  const phraseCostSoFar = phrasePassResults.reduce((s, r) => s + (r.cost || 0), 0);
  const phraseTokensIn = phrasePassResults.reduce((s, r) => s + (r.tokensIn || 0), 0);
  const phraseTokensOut = phrasePassResults.reduce((s, r) => s + (r.tokensOut || 0), 0);
  onProgress?.({
    pass: 'phrases', status: 'complete',
    phraseCount: phraseStarts.length,
    tokensIn: phraseTokensIn, tokensOut: phraseTokensOut, cost: phraseCostSoFar,
  });

  // Drop last phrase at truncation boundary if requested
  if (truncate?.dropLastPhrase && text.length > (truncate.maxChars || Infinity) && phraseStarts.length > 1) {
    phraseStarts = phraseStarts.slice(0, -1);
  }

  // Build phrases from indices
  const phrases = [];
  for (let i = 0; i < phraseStarts.length; i++) {
    const start = phraseStarts[i];
    const end = i + 1 < phraseStarts.length ? phraseStarts[i + 1] : words.length;
    const phraseText = words.slice(start, end).join(' ');
    const verse = (verseRanges || []).some(([vs, ve]) => start >= vs && start < ve);
    phrases.push({ text: phraseText, verse });
  }

  // Pass 2: Sentence boundaries
  const { sentenceStarts, sentenceTypes, passResult: sentencePassResult } = await segmentSentences({
    phrases, langName, llmCall,
  });

  // Report sentence pass completion
  const sentTokensIn = phraseTokensIn + (sentencePassResult.tokensIn || 0);
  const sentTokensOut = phraseTokensOut + (sentencePassResult.tokensOut || 0);
  const sentCostSoFar = phraseCostSoFar + (sentencePassResult.cost || 0);
  onProgress?.({
    pass: 'sentences',
    phraseCount: phraseStarts.length,
    sentenceCount: sentenceStarts.length,
    tokensIn: sentTokensIn, tokensOut: sentTokensOut, cost: sentCostSoFar,
  });

  // Build sentences from indices
  const sentences = [];
  for (let i = 0; i < sentenceStarts.length; i++) {
    const start = sentenceStarts[i];
    const end = i + 1 < sentenceStarts.length ? sentenceStarts[i + 1] : phrases.length;
    const sentPhrases = phrases.slice(start, end);
    const sentText = sentPhrases.map(p => p.text).join(' ');
    const type = sentenceTypes[String(start)] || 'prose';
    sentences.push({ text: sentText, type });
  }

  // Pass 3: Paragraph boundaries
  const { paragraphStarts, passResult: paragraphPassResult } = await segmentParagraphs({
    sentences, langName, llmCall,
  });

  // Report final completion
  const allResults = [...phrasePassResults, sentencePassResult, paragraphPassResult];
  const finalTokensIn = allResults.reduce((s, r) => s + (r.tokensIn || 0), 0);
  const finalTokensOut = allResults.reduce((s, r) => s + (r.tokensOut || 0), 0);
  const finalCost = allResults.reduce((s, r) => s + (r.cost || 0), 0);
  onProgress?.({
    pass: 'complete',
    phraseCount: phraseStarts.length,
    sentenceCount: sentenceStarts.length,
    paragraphCount: paragraphStarts.length,
    tokensIn: finalTokensIn, tokensOut: finalTokensOut, cost: finalCost,
  });

  // Post-processing: build full structure from indices
  const structured = buildStructureFromIndices({
    words, phraseStarts, sentenceStarts, sentenceTypes, paragraphStarts, verseRanges,
  });

  return {
    words,
    phraseStarts,
    sentenceStarts,
    sentenceTypes,
    paragraphStarts,
    verseRanges,
    phrases,
    sentences,
    structured,
    cost: {
      total: finalCost,
      passes: {
        phrases: phraseCostSoFar,
        sentences: sentencePassResult.cost || 0,
        paragraphs: paragraphPassResult.cost || 0,
      },
    },
    tokens: { in: finalTokensIn, out: finalTokensOut },
    sampleChars: processText.length,
    totalChars: text.length,
  };
}

export { getPhraseSystem, getSentenceSystem, getParagraphSystem, segmentPhrases, segmentSentences, segmentParagraphs };
