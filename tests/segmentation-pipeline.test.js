import { describe, it, expect } from 'vitest';
import { runSegmentation } from '../workers/translation-pipeline/segmentation.js';
import { tokenizeWords, buildStructureFromIndices } from '../workers/translation-pipeline/utils.js';

/**
 * Normalize whitespace: collapse all whitespace runs to a single space, trim.
 * This is the canonical form for comparison — segmentation should preserve this exactly.
 */
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Strip * markers and normalize whitespace — the canonical form of source text
 * that segmentation must preserve exactly.
 */
function canonicalize(text) {
  return normalizeWhitespace(text.replace(/\*/g, ''));
}

/**
 * Extract all text from a segmented structure by joining all phrases.
 */
function extractText(structured) {
  const words = [];
  for (const para of structured.paragraphs) {
    for (const sent of para.sentences) {
      for (const phrase of sent.phrases) {
        words.push(phrase.text);
      }
    }
  }
  return words.join(' ');
}

// --- Text Preservation Tests (no LLM needed — pure code path) ---

describe('text preservation through buildStructureFromIndices', () => {
  it('preserves simple Arabic text exactly', () => {
    const original = 'بسم الله الرحمن الرحيم قل هو الله أحد الله الصمد';
    const { words } = tokenizeWords(original);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0, 4, 7],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves Arabic text with * markers — markers removed, text intact', () => {
    const original = 'بسم الله الرحمن الرحيم * قل هو الله أحد * الله الصمد';
    const { words, mandatoryBreaks } = tokenizeWords(original);

    // Mandatory breaks become phrase starts
    const phraseStarts = [0, ...mandatoryBreaks];

    const structured = buildStructureFromIndices({
      words,
      phraseStarts,
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves Persian text with diacritics', () => {
    const original = 'ای دوستان الهی در این ایام که ابرهای تیره بلا افق عالم را فرا گرفته';
    const { words } = tokenizeWords(original);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0, 3, 6],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves text with single-word phrases', () => {
    const original = 'بسم الله الرحمن الرحيم';
    const { words } = tokenizeWords(original);

    // Every word is its own phrase
    const phraseStarts = words.map((_, i) => i);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts,
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves text with one giant phrase', () => {
    const original = 'بسم الله الرحمن الرحيم قل هو الله أحد';
    const { words } = tokenizeWords(original);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0], // all words in one phrase
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves text across multiple paragraphs and sentences', () => {
    const words = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'];
    const original = words.join(' ');

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0, 2, 4, 6, 8],  // 5 phrases of 2 words
      sentenceStarts: [0, 2, 4],        // 3 sentences
      sentenceTypes: { '0': 'prose', '2': 'prose', '4': 'prose' },
      paragraphStarts: [0, 2],           // 2 paragraphs
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(original);
  });

  it('preserves text with verse annotations — annotations do not alter content', () => {
    const original = 'prose word here * verse word one verse word two * back to prose';
    const { words, mandatoryBreaks } = tokenizeWords(original);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0, ...mandatoryBreaks],
      sentenceStarts: [0, 1],
      sentenceTypes: { '0': 'prose', '1': 'verse_couplet' },
      paragraphStarts: [0],
      verseRanges: [[3, 7]], // verse range
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves Arabic with tashkeel (diacritical marks)', () => {
    const original = 'وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';
    const { words } = tokenizeWords(original);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    // Exact character-level preservation including tashkeel
    expect(extractText(structured)).toBe(canonicalize(original));
  });

  it('preserves text with multiple consecutive * markers', () => {
    const original = 'before * * after';
    const { words } = tokenizeWords(original);

    const structured = buildStructureFromIndices({
      words,
      phraseStarts: [0, 1],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(extractText(structured)).toBe(canonicalize(original));
  });
});

// --- Full Pipeline Text Preservation Tests (with mocked LLM) ---

describe('runSegmentation text preservation with mocked LLM', () => {
  function createMockLlm(phraseStarts, sentenceStarts, sentenceTypes, paragraphStarts) {
    let callCount = 0;
    return async ({ phase }) => {
      callCount++;
      if (phase.startsWith('segment_phrases')) {
        return {
          data: { phrase_starts: phraseStarts, verse_starts: [], verse_ends: [] },
          tokensIn: 100, tokensOut: 20, cost: 0.001,
        };
      }
      if (phase === 'segment_sentences') {
        return {
          data: { sentence_starts: sentenceStarts, sentence_types: sentenceTypes },
          tokensIn: 80, tokensOut: 15, cost: 0.0008,
        };
      }
      if (phase === 'segment_paras') {
        return {
          data: { paragraph_starts: paragraphStarts },
          tokensIn: 60, tokensOut: 10, cost: 0.0005,
        };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    };
  }

  it('preserves Arabic Basmala through full pipeline', async () => {
    const text = 'بسم الله الرحمن الرحيم قل هو الله أحد الله الصمد';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0, 4, 7], [0], { '0': 'prose' }, [0]),
    });

    expect(extractText(result.structured)).toBe(canonicalize(text));
    expect(result.words.join(' ')).toBe(canonicalize(text));
  });

  it('preserves text with * markers through full pipeline', async () => {
    const text = 'بسم الله * الرحمن الرحيم * قل هو الله';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0, 2, 4], [0], { '0': 'prose' }, [0]),
    });

    expect(extractText(result.structured)).toBe(canonicalize(text));
  });

  it('preserves Persian text through full pipeline', async () => {
    const text = 'ای دوستان الهی در این ایام که ابرهای تیره بلا افق عالم را فرا گرفته';
    const result = await runSegmentation({
      text,
      lang: 'fa',
      llmCall: createMockLlm([0, 3, 7], [0], { '0': 'prose' }, [0]),
    });

    expect(extractText(result.structured)).toBe(canonicalize(text));
  });

  it('preserves long text with multiple paragraphs', async () => {
    const text = 'word0 word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm(
        [0, 3, 6, 9],         // 4 phrases
        [0, 2],                // 2 sentences
        { '0': 'prose', '2': 'prose' },
        [0, 1],                // 2 paragraphs
      ),
    });

    expect(extractText(result.structured)).toBe(canonicalize(text));
  });

  it('returns correct cost aggregation', async () => {
    const text = 'بسم الله الرحمن الرحيم';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0], [0], { '0': 'prose' }, [0]),
    });

    expect(result.cost.total).toBeCloseTo(0.001 + 0.0008 + 0.0005, 6);
    expect(result.cost.passes.phrases).toBeCloseTo(0.001, 6);
    expect(result.cost.passes.sentences).toBeCloseTo(0.0008, 6);
    expect(result.cost.passes.paragraphs).toBeCloseTo(0.0005, 6);
    expect(result.tokens.in).toBe(240);
    expect(result.tokens.out).toBe(45);
  });

  it('truncation preserves text within the sample window', async () => {
    const text = 'a b c d e f g h i j k l m n o p q r s t';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      truncate: { maxChars: 10 },  // "a b c d e " → truncated to "a b c d e"
      llmCall: createMockLlm([0, 3], [0], { '0': 'prose' }, [0]),
    });

    // Sample should be truncated but all words within sample should be preserved
    expect(result.sampleChars).toBeLessThanOrEqual(10);
    expect(result.totalChars).toBe(text.length);
    // Every word in result.words should appear in the original text
    for (const word of result.words) {
      expect(text).toContain(word);
    }
  });

  it('handles empty text gracefully', async () => {
    const text = '';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0], [0], {}, [0]),
    });

    expect(result.words).toEqual([]);
  });

  it('handles text that is only * markers', async () => {
    const text = '* * *';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0], [0], {}, [0]),
    });

    expect(result.words).toEqual([]);
  });

  it('handles single-word text', async () => {
    const text = 'بسم';
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0], [0], { '0': 'prose' }, [0]),
    });

    expect(extractText(result.structured)).toBe('بسم');
    expect(result.words).toEqual(['بسم']);
  });

  it('calls onProgress at each pass with correct data', async () => {
    const text = 'بسم الله الرحمن الرحيم قل هو الله أحد الله الصمد';
    const progressCalls = [];
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0, 4, 7], [0, 1], { '0': 'prose', '1': 'prose' }, [0]),
      onProgress: (detail) => progressCalls.push(detail),
    });

    // Should have at least: phrases complete, sentences, complete
    expect(progressCalls.length).toBeGreaterThanOrEqual(3);

    // Find the phrase-complete call
    const phraseComplete = progressCalls.find(c => c.pass === 'phrases' && c.status === 'complete');
    expect(phraseComplete).toBeDefined();
    expect(phraseComplete.phraseCount).toBe(3);
    expect(phraseComplete.tokensIn).toBe(100);
    expect(phraseComplete.tokensOut).toBe(20);
    expect(phraseComplete.cost).toBeCloseTo(0.001, 6);

    // Find the sentence call
    const sentenceCall = progressCalls.find(c => c.pass === 'sentences');
    expect(sentenceCall).toBeDefined();
    expect(sentenceCall.phraseCount).toBe(3);
    expect(sentenceCall.sentenceCount).toBe(2);

    // Find the complete call
    const completeCall = progressCalls.find(c => c.pass === 'complete');
    expect(completeCall).toBeDefined();
    expect(completeCall.phraseCount).toBe(3);
    expect(completeCall.sentenceCount).toBe(2);
    expect(completeCall.paragraphCount).toBe(1);
    expect(completeCall.tokensIn).toBe(240);
    expect(completeCall.tokensOut).toBe(45);
  });

  it('works without onProgress (optional parameter)', async () => {
    const text = 'بسم الله الرحمن الرحيم';
    // Should not throw when onProgress is not provided
    const result = await runSegmentation({
      text,
      lang: 'ar',
      llmCall: createMockLlm([0], [0], { '0': 'prose' }, [0]),
    });

    expect(result.structured.paragraphs).toHaveLength(1);
  });
});

// --- Invariant: every possible index combination preserves text ---

describe('segmentation invariant: text preservation for arbitrary indices', () => {
  const testCases = [
    { name: 'Arabic Basmala', text: 'بسم الله الرحمن الرحيم' },
    { name: 'Arabic with markers', text: 'بسم الله * الرحمن الرحيم * قل هو' },
    { name: 'Persian phrase', text: 'ای دوستان الهی در این ایام' },
    { name: 'Mixed with tashkeel', text: 'وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' },
    { name: 'Latin test text', text: 'the quick brown fox jumps over the lazy dog' },
  ];

  for (const { name, text } of testCases) {
    it(`${name}: any valid phrase/sentence/para split preserves all text`, () => {
      const { words } = tokenizeWords(text);
      if (words.length === 0) return;

      const expected = canonicalize(text);

      // Test several random valid index combinations
      const phraseSplits = [
        [0],                                         // 1 phrase
        words.map((_, i) => i),                      // every word is a phrase
        [0, Math.floor(words.length / 2)].filter(i => i < words.length), // 2 phrases
      ];

      for (const phraseStarts of phraseSplits) {
        const sentenceSplits = [
          [0],                                       // 1 sentence
          phraseStarts.length > 1 ? [0, 1] : [0],   // 2 sentences if possible
        ];

        for (const sentenceStarts of sentenceSplits) {
          const paragraphStarts = [0];

          const structured = buildStructureFromIndices({
            words,
            phraseStarts,
            sentenceStarts,
            sentenceTypes: Object.fromEntries(sentenceStarts.map(s => [String(s), 'prose'])),
            paragraphStarts,
            verseRanges: [],
          });

          const reconstructed = extractText(structured);
          expect(reconstructed).toBe(expected);
        }
      }
    });
  }
});
