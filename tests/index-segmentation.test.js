import { describe, it, expect } from 'vitest';
import {
  tokenizeWords,
  buildNumberedWordList,
  buildNumberedPhraseList,
  buildNumberedSentenceList,
  validateIndices,
  windowWords,
  buildStructureFromIndices,
} from '../workers/translation-pipeline/utils.js';

// --- tokenizeWords ---

describe('tokenizeWords', () => {
  it('splits simple text on whitespace', () => {
    const { words, mandatoryBreaks } = tokenizeWords('hello world foo');
    expect(words).toEqual(['hello', 'world', 'foo']);
    expect(mandatoryBreaks).toEqual([]);
  });

  it('splits Arabic text', () => {
    const { words } = tokenizeWords('بسم الله الرحمن الرحيم');
    expect(words).toEqual(['بسم', 'الله', 'الرحمن', 'الرحيم']);
  });

  it('extracts * as mandatory break — next word starts a new phrase', () => {
    const { words, mandatoryBreaks } = tokenizeWords('بسم الله * الرحمن الرحيم');
    expect(words).toEqual(['بسم', 'الله', 'الرحمن', 'الرحيم']);
    expect(mandatoryBreaks).toEqual([2]); // index of الرحمن
  });

  it('handles multiple * delimiters', () => {
    const { words, mandatoryBreaks } = tokenizeWords('a b * c d * e f');
    expect(words).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(mandatoryBreaks).toEqual([2, 4]); // indices of c and e
  });

  it('handles * at start of text', () => {
    const { words, mandatoryBreaks } = tokenizeWords('* hello world');
    expect(words).toEqual(['hello', 'world']);
    expect(mandatoryBreaks).toEqual([0]); // first word is a mandatory start
  });

  it('handles * at end of text', () => {
    const { words, mandatoryBreaks } = tokenizeWords('hello world *');
    expect(words).toEqual(['hello', 'world']);
    expect(mandatoryBreaks).toEqual([2]); // past end of array (no word after *)
  });

  it('handles consecutive * delimiters', () => {
    const { words, mandatoryBreaks } = tokenizeWords('a * * b');
    expect(words).toEqual(['a', 'b']);
    // Both * point to the same next word index
    expect(mandatoryBreaks).toEqual([1, 1]);
  });

  it('handles empty string', () => {
    const { words, mandatoryBreaks } = tokenizeWords('');
    expect(words).toEqual([]);
    expect(mandatoryBreaks).toEqual([]);
  });

  it('handles whitespace-only string', () => {
    const { words, mandatoryBreaks } = tokenizeWords('   ');
    expect(words).toEqual([]);
    expect(mandatoryBreaks).toEqual([]);
  });

  it('handles tabs and newlines', () => {
    const { words } = tokenizeWords('hello\tworld\nfoo');
    expect(words).toEqual(['hello', 'world', 'foo']);
  });

  it('handles Persian text with ezafe', () => {
    const { words } = tokenizeWords('کتاب الله مستطاب');
    expect(words).toHaveLength(3);
  });
});

// --- buildNumberedWordList ---

describe('buildNumberedWordList', () => {
  it('builds compact numbered format', () => {
    const result = buildNumberedWordList(['بسم', 'الله', 'الرحمن']);
    expect(result).toBe('0:بسم 1:الله 2:الرحمن');
  });

  it('handles empty array', () => {
    expect(buildNumberedWordList([])).toBe('');
  });

  it('handles single word', () => {
    expect(buildNumberedWordList(['hello'])).toBe('0:hello');
  });

  it('preserves original word characters', () => {
    const result = buildNumberedWordList(['وَ', 'الْحَمْدُ']);
    expect(result).toBe('0:وَ 1:الْحَمْدُ');
  });
});

// --- buildNumberedPhraseList ---

describe('buildNumberedPhraseList', () => {
  it('builds numbered phrase list with P prefix', () => {
    const phrases = [
      { text: 'بسم الله الرحمن الرحيم' },
      { text: 'قل هو الله أحد' },
    ];
    const result = buildNumberedPhraseList(phrases);
    expect(result).toBe('P0: بسم الله الرحمن الرحيم\nP1: قل هو الله أحد');
  });

  it('handles empty array', () => {
    expect(buildNumberedPhraseList([])).toBe('');
  });

  it('handles single phrase', () => {
    const result = buildNumberedPhraseList([{ text: 'hello world' }]);
    expect(result).toBe('P0: hello world');
  });
});

// --- buildNumberedSentenceList ---

describe('buildNumberedSentenceList', () => {
  it('builds numbered sentence list with type annotation', () => {
    const sentences = [
      { text: 'بسم الله الرحمن الرحيم', type: 'prose' },
      { text: 'قل هو الله أحد', type: 'verse_couplet' },
    ];
    const result = buildNumberedSentenceList(sentences);
    expect(result).toBe('S0 [prose]: بسم الله الرحمن الرحيم\nS1 [verse_couplet]: قل هو الله أحد');
  });

  it('handles empty array', () => {
    expect(buildNumberedSentenceList([])).toBe('');
  });
});

// --- validateIndices ---

describe('validateIndices', () => {
  it('accepts valid sorted indices starting at 0', () => {
    const result = validateIndices([0, 3, 7, 12], 20, 'test');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects empty array', () => {
    const result = validateIndices([], 10, 'test');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('empty');
  });

  it('rejects non-array', () => {
    const result = validateIndices(null, 10, 'test');
    expect(result.valid).toBe(false);
  });

  it('rejects if not starting with 0', () => {
    const result = validateIndices([1, 3, 7], 10, 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('start with 0'))).toBe(true);
  });

  it('rejects out-of-range indices', () => {
    const result = validateIndices([0, 5, 15], 10, 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('out of range'))).toBe(true);
  });

  it('rejects non-ascending indices', () => {
    const result = validateIndices([0, 5, 3], 10, 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not strictly ascending'))).toBe(true);
  });

  it('rejects duplicate indices', () => {
    const result = validateIndices([0, 5, 5, 8], 10, 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not strictly ascending'))).toBe(true);
  });

  it('rejects negative indices', () => {
    const result = validateIndices([0, -1, 5], 10, 'test');
    expect(result.valid).toBe(false);
  });

  it('accepts single index [0] when max > 0', () => {
    const result = validateIndices([0], 5, 'test');
    expect(result.valid).toBe(true);
  });

  it('includes label in error messages', () => {
    const result = validateIndices([1], 10, 'phrase_starts');
    expect(result.errors[0]).toContain('phrase_starts');
  });

  it('rejects index equal to max (exclusive upper bound)', () => {
    const result = validateIndices([0, 10], 10, 'test');
    expect(result.valid).toBe(false);
  });
});

// --- windowWords ---

describe('windowWords', () => {
  it('returns single window for short word list', () => {
    const words = ['hello', 'world'];
    const windows = windowWords(words, 5000);
    expect(windows).toHaveLength(1);
    expect(windows[0].startIdx).toBe(0);
    expect(windows[0].endIdx).toBe(2);
  });

  it('returns empty array for empty input', () => {
    expect(windowWords([])).toEqual([]);
  });

  it('splits long word lists into multiple windows', () => {
    // Create a word list that exceeds the window size
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`); // each ~6 chars + index
    const windows = windowWords(words, 200);
    expect(windows.length).toBeGreaterThan(1);

    // Windows should cover all words
    expect(windows[0].startIdx).toBe(0);
    expect(windows[windows.length - 1].endIdx).toBe(500);

    // Each window should start where the previous ended
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startIdx).toBe(windows[i - 1].endIdx);
    }
  });

  it('never creates empty windows', () => {
    const words = ['a', 'b', 'c', 'd', 'e'];
    const windows = windowWords(words, 5);
    for (const win of windows) {
      expect(win.endIdx).toBeGreaterThan(win.startIdx);
    }
  });

  it('handles window size smaller than a single word', () => {
    const words = ['superlongword', 'another'];
    const windows = windowWords(words, 1);
    // Should still produce windows covering all words
    const covered = new Set();
    for (const win of windows) {
      for (let i = win.startIdx; i < win.endIdx; i++) covered.add(i);
    }
    expect(covered.size).toBe(2);
  });
});

// --- buildStructureFromIndices ---

describe('buildStructureFromIndices', () => {
  const sampleWords = ['بسم', 'الله', 'الرحمن', 'الرحيم', 'قل', 'هو', 'الله', 'أحد'];

  it('builds correct phrases from word indices', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 4],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].sentences).toHaveLength(1);
    expect(result.paragraphs[0].sentences[0].phrases).toHaveLength(2);
    expect(result.paragraphs[0].sentences[0].phrases[0].text).toBe('بسم الله الرحمن الرحيم');
    expect(result.paragraphs[0].sentences[0].phrases[1].text).toBe('قل هو الله أحد');
  });

  it('reconstructs all original words exactly', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 2, 4, 6],
      sentenceStarts: [0, 2],
      sentenceTypes: { '0': 'prose', '2': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    // Collect all words from the structure
    const allWords = [];
    for (const para of result.paragraphs) {
      for (const sent of para.sentences) {
        for (const phrase of sent.phrases) {
          allWords.push(...phrase.text.split(' '));
        }
      }
    }
    expect(allWords).toEqual(sampleWords);
  });

  it('handles verse ranges correctly', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 4],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'verse_couplet' },
      paragraphStarts: [0],
      verseRanges: [[4, 8]], // words 4-7 are verse
    });

    expect(result.paragraphs[0].sentences[0].phrases[0].verse).toBe(false);
    expect(result.paragraphs[0].sentences[0].phrases[1].verse).toBe(true);
  });

  it('derives paragraph type from sentence types — all prose', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 4],
      sentenceStarts: [0, 1],
      sentenceTypes: { '0': 'prose', '1': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(result.paragraphs[0].type).toBe('prose');
  });

  it('derives paragraph type — all verse', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 4],
      sentenceStarts: [0, 1],
      sentenceTypes: { '0': 'verse_couplet', '1': 'verse_line' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(result.paragraphs[0].type).toBe('verse_stanza');
  });

  it('derives paragraph type — mixed', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 4],
      sentenceStarts: [0, 1],
      sentenceTypes: { '0': 'prose', '1': 'verse_couplet' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(result.paragraphs[0].type).toBe('mixed');
  });

  it('creates multiple paragraphs from paragraph starts', () => {
    const result = buildStructureFromIndices({
      words: sampleWords,
      phraseStarts: [0, 4],
      sentenceStarts: [0, 1],
      sentenceTypes: { '0': 'prose', '1': 'prose' },
      paragraphStarts: [0, 1], // 2 paragraphs: sentence 0, then sentence 1
      verseRanges: [],
    });

    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[0].sentences).toHaveLength(1);
    expect(result.paragraphs[1].sentences).toHaveLength(1);
  });

  it('handles single-word phrases', () => {
    const result = buildStructureFromIndices({
      words: ['hello', 'world', 'test'],
      phraseStarts: [0, 1, 2],
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(result.paragraphs[0].sentences[0].phrases).toHaveLength(3);
    expect(result.paragraphs[0].sentences[0].phrases[0].text).toBe('hello');
    expect(result.paragraphs[0].sentences[0].phrases[1].text).toBe('world');
    expect(result.paragraphs[0].sentences[0].phrases[2].text).toBe('test');
  });

  it('defaults sentence type to prose when not specified', () => {
    const result = buildStructureFromIndices({
      words: ['hello', 'world'],
      phraseStarts: [0],
      sentenceStarts: [0],
      sentenceTypes: {}, // no types specified
      paragraphStarts: [0],
      verseRanges: [],
    });

    expect(result.paragraphs[0].sentences[0].type).toBe('prose');
    expect(result.paragraphs[0].type).toBe('prose');
  });

  it('handles null/undefined verseRanges', () => {
    const result = buildStructureFromIndices({
      words: ['hello', 'world'],
      phraseStarts: [0],
      sentenceStarts: [0],
      sentenceTypes: {},
      paragraphStarts: [0],
      verseRanges: null,
    });

    expect(result.paragraphs[0].sentences[0].phrases[0].verse).toBe(false);
  });

  it('handles complex multi-paragraph structure', () => {
    // 10 words → 5 phrases → 3 sentences → 2 paragraphs
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`);
    const result = buildStructureFromIndices({
      words,
      phraseStarts: [0, 2, 4, 6, 8], // 5 phrases of 2 words each
      sentenceStarts: [0, 2, 4],       // 3 sentences
      sentenceTypes: { '0': 'prose', '2': 'prose', '4': 'verse_couplet' },
      paragraphStarts: [0, 2],          // 2 paragraphs
      verseRanges: [],
    });

    expect(result.paragraphs).toHaveLength(2);
    // Para 0: sentences 0,1 (phrases 0,1 and 2,3)
    expect(result.paragraphs[0].sentences).toHaveLength(2);
    expect(result.paragraphs[0].type).toBe('prose');
    // Para 1: sentence 2 (phrases 4)
    expect(result.paragraphs[1].sentences).toHaveLength(1);
    expect(result.paragraphs[1].type).toBe('verse_stanza');

    // Verify all 10 words are reconstructed
    const allWords = [];
    for (const p of result.paragraphs) {
      for (const s of p.sentences) {
        for (const ph of s.phrases) {
          allWords.push(...ph.text.split(' '));
        }
      }
    }
    expect(allWords).toEqual(words);
  });
});

// --- Integration: tokenize → build structure round-trip ---

describe('tokenize-to-structure round-trip', () => {
  it('preserves all text through the full pipeline', () => {
    const original = 'بسم الله الرحمن الرحيم * قل هو الله أحد * الله الصمد';
    const { words, mandatoryBreaks } = tokenizeWords(original);

    // words: بسم(0) الله(1) الرحمن(2) الرحيم(3) قل(4) هو(5) الله(6) أحد(7) الله(8) الصمد(9)
    // First * after الرحيم → mandatory break at index 4 (قل)
    // Second * after أحد → mandatory break at index 8 (الله)
    expect(mandatoryBreaks).toEqual([4, 8]);

    // Simulate LLM output: phrase starts include mandatory breaks
    const phraseStarts = [0, 4, 8]; // 3 phrases

    const result = buildStructureFromIndices({
      words,
      phraseStarts,
      sentenceStarts: [0],
      sentenceTypes: { '0': 'prose' },
      paragraphStarts: [0],
      verseRanges: [],
    });

    // Reconstruct full text from structure
    const reconstructed = result.paragraphs
      .flatMap(p => p.sentences)
      .flatMap(s => s.phrases)
      .map(p => p.text)
      .join(' ');

    // Should match original minus the * delimiters
    const expectedText = words.join(' ');
    expect(reconstructed).toBe(expectedText);
  });

  it('numbered word list round-trips correctly', () => {
    const { words } = tokenizeWords('بسم الله الرحمن الرحيم');
    const numbered = buildNumberedWordList(words);

    // Parse back
    const parsed = numbered.split(' ').map(entry => {
      const [idx, word] = entry.split(':');
      return { idx: Number(idx), word };
    });

    expect(parsed.map(p => p.word)).toEqual(words);
    expect(parsed.map(p => p.idx)).toEqual([0, 1, 2, 3]);
  });
});
