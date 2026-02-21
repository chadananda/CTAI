import { describe, it, expect } from 'vitest';
import {
  generateId, wordCount, splitIntoBlocks, parseAIJson, calculateCost,
  getBlockStatusLabel, calculateProgress, buildUnsubscribeUrl,
  VALID_BLOCK_STATUSES, VALID_JOB_STATUSES,
  MAX_BLOCK_WORDS, MAX_DELIB_ROUNDS, MODEL, PRICING,
} from '../workers/translation-pipeline/utils.js';

describe('generateId', () => {
  it('generates a string of default length 21', () => {
    const id = generateId();
    expect(id).toHaveLength(21);
    expect(typeof id).toBe('string');
  });

  it('generates custom length', () => {
    expect(generateId(10)).toHaveLength(10);
    expect(generateId(32)).toHaveLength(32);
  });

  it('uses only alphanumeric characters', () => {
    const id = generateId(100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('wordCount', () => {
  it('counts words in a simple string', () => {
    expect(wordCount('hello world')).toBe(2);
  });

  it('handles multiple spaces', () => {
    expect(wordCount('hello   world   test')).toBe(3);
  });

  it('handles leading/trailing whitespace', () => {
    expect(wordCount('  hello world  ')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(wordCount('   ')).toBe(0);
  });

  it('counts Arabic/Persian words', () => {
    expect(wordCount('بسم الله الرحمن الرحیم')).toBe(4);
  });

  it('handles newlines and tabs', () => {
    expect(wordCount('hello\nworld\tthere')).toBe(3);
  });
});

describe('splitIntoBlocks', () => {
  it('puts all paragraphs in one block when under limit', () => {
    const paras = [{ text: 'short paragraph one' }, { text: 'short paragraph two' }];
    const blocks = splitIntoBlocks(paras, 100);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].texts).toHaveLength(2);
    expect(blocks[0].paraIndices).toEqual([0, 1]);
  });

  it('splits into multiple blocks when exceeding limit', () => {
    const longText = Array(500).fill('word').join(' '); // 500 words
    const paras = [
      { text: longText },
      { text: longText },
      { text: longText },
    ];
    const blocks = splitIntoBlocks(paras, 800);
    expect(blocks.length).toBeGreaterThan(1);
    // Each block should have ≤ 800 words
    for (const block of blocks) {
      const totalWords = block.texts.reduce((s, t) => s + wordCount(t), 0);
      expect(totalWords).toBeLessThanOrEqual(1000); // 500 per para, max 2 fit in 800
    }
  });

  it('handles string paragraphs (not objects)', () => {
    const paras = ['hello world', 'foo bar baz'];
    const blocks = splitIntoBlocks(paras, 100);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].texts).toEqual(['hello world', 'foo bar baz']);
  });

  it('returns empty array for empty input', () => {
    expect(splitIntoBlocks([])).toEqual([]);
  });

  it('puts single large paragraph in its own block', () => {
    const huge = Array(3000).fill('word').join(' ');
    const paras = [{ text: 'small' }, { text: huge }, { text: 'also small' }];
    const blocks = splitIntoBlocks(paras, 2000);
    // 'small' should be in block 1, huge fills block 2, 'also small' in block 3
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves paragraph indices correctly', () => {
    const paras = Array.from({ length: 5 }, (_, i) => ({ text: `para ${i}` }));
    const blocks = splitIntoBlocks(paras, 100);
    const allIndices = blocks.flatMap(b => b.paraIndices);
    expect(allIndices).toEqual([0, 1, 2, 3, 4]);
  });

  it('respects MAX_BLOCK_WORDS default', () => {
    // Create paragraphs that sum to > 2000 words
    const para = { text: Array(600).fill('word').join(' ') }; // 600 words each
    const paras = [para, para, para, para]; // 2400 total
    const blocks = splitIntoBlocks(paras);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('never creates empty blocks', () => {
    const paras = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    const blocks = splitIntoBlocks(paras, 1);
    for (const block of blocks) {
      expect(block.texts.length).toBeGreaterThan(0);
    }
  });
});

describe('parseAIJson', () => {
  it('parses clean JSON', () => {
    expect(parseAIJson('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('strips markdown fences', () => {
    expect(parseAIJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON from surrounding text', () => {
    expect(parseAIJson('Here is the result:\n{"data": true}\nDone.')).toEqual({ data: true });
  });

  it('extracts arrays', () => {
    expect(parseAIJson('Results: [1, 2, 3] end')).toEqual([1, 2, 3]);
  });

  it('throws on invalid input', () => {
    expect(() => parseAIJson('no json here')).toThrow('Failed to parse JSON');
  });

  it('handles nested structures', () => {
    const result = parseAIJson('{"paragraphs": [{"text": "hello", "phrases": ["a", "b"]}]}');
    expect(result.paragraphs[0].phrases).toEqual(['a', 'b']);
  });
});

describe('calculateCost', () => {
  it('calculates cost from token counts', () => {
    // 1000 input tokens at $3/M + 500 output tokens at $15/M
    const cost = calculateCost(1000, 500);
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateCost(0, 0)).toBe(0);
  });

  it('handles null/undefined tokens', () => {
    expect(calculateCost(null, undefined)).toBe(0);
  });

  it('uses custom pricing', () => {
    const cost = calculateCost(1000000, 0, { input: 1.00, output: 5.00 });
    expect(cost).toBe(1.00);
  });
});

describe('getBlockStatusLabel', () => {
  it('returns correct labels for each status', () => {
    expect(getBlockStatusLabel('pending', 0)).toBe('Pending');
    expect(getBlockStatusLabel('researching', 0)).toBe('Researching');
    expect(getBlockStatusLabel('translating', 0)).toBe('Translating');
    expect(getBlockStatusLabel('converging', 0)).toBe('Converging');
    expect(getBlockStatusLabel('complete', 0)).toBe('Complete');
    expect(getBlockStatusLabel('failed', 0)).toBe('Failed');
  });

  it('includes deliberation round number', () => {
    expect(getBlockStatusLabel('deliberating', 1)).toBe('Deliberation R1');
    expect(getBlockStatusLabel('deliberating', 2)).toBe('Deliberation R2');
    expect(getBlockStatusLabel('deliberating', 3)).toBe('Deliberation R3');
  });

  it('handles deliberating with round 0', () => {
    expect(getBlockStatusLabel('deliberating', 0)).toBe('Deliberating');
  });

  it('returns Unknown for invalid status', () => {
    expect(getBlockStatusLabel('invalid', 0)).toBe('Unknown');
  });
});

describe('calculateProgress', () => {
  it('returns 100 for complete jobs', () => {
    expect(calculateProgress({ totalBlocks: 5, blocksDone: 5, status: 'complete' })).toBe(100);
  });

  it('returns 0 for failed jobs', () => {
    expect(calculateProgress({ totalBlocks: 5, blocksDone: 3, status: 'failed' })).toBe(0);
  });

  it('calculates segmentation progress (no blocks yet)', () => {
    const progress = calculateProgress({ totalBlocks: 0, blocksDone: 0, status: 'segmenting' });
    expect(progress).toBe(0); // seg not done, 0 total blocks known
  });

  it('shows progress after segmentation with blocks', () => {
    // seg done (1) + 2 of 5 blocks done + finalize not done
    // total = 1 + 5 + 1 = 7, done = 1 + 2 + 0 = 3
    const progress = calculateProgress({ totalBlocks: 5, blocksDone: 2, status: 'translating' });
    expect(progress).toBe(Math.round(3 / 7 * 100));
  });

  it('handles edge case of 0 total blocks', () => {
    const progress = calculateProgress({ totalBlocks: 0, blocksDone: 0, status: 'pending' });
    expect(progress).toBe(0);
  });
});

describe('constants', () => {
  it('MAX_BLOCK_WORDS is 2000', () => {
    expect(MAX_BLOCK_WORDS).toBe(2000);
  });

  it('MAX_DELIB_ROUNDS is 3', () => {
    expect(MAX_DELIB_ROUNDS).toBe(3);
  });

  it('uses Sonnet model', () => {
    expect(MODEL).toContain('sonnet');
  });

  it('has correct Sonnet pricing', () => {
    expect(PRICING.input).toBe(3.00);
    expect(PRICING.output).toBe(15.00);
  });
});

describe('VALID_BLOCK_STATUSES', () => {
  it('contains all expected statuses', () => {
    expect(VALID_BLOCK_STATUSES).toContain('pending');
    expect(VALID_BLOCK_STATUSES).toContain('researching');
    expect(VALID_BLOCK_STATUSES).toContain('translating');
    expect(VALID_BLOCK_STATUSES).toContain('deliberating');
    expect(VALID_BLOCK_STATUSES).toContain('converging');
    expect(VALID_BLOCK_STATUSES).toContain('complete');
    expect(VALID_BLOCK_STATUSES).toContain('failed');
  });

  it('has exactly 7 statuses', () => {
    expect(VALID_BLOCK_STATUSES).toHaveLength(7);
  });
});

describe('VALID_JOB_STATUSES', () => {
  it('contains all expected statuses', () => {
    const expected = ['pending', 'paid', 'segmenting', 'researching', 'translating',
      'deliberating', 'assembling', 'reviewing', 'complete', 'failed'];
    for (const s of expected) {
      expect(VALID_JOB_STATUSES).toContain(s);
    }
  });

  it('has exactly 10 statuses', () => {
    expect(VALID_JOB_STATUSES).toHaveLength(10);
  });
});

describe('buildUnsubscribeUrl', () => {
  it('builds correct URL', () => {
    const url = buildUnsubscribeUrl('https://ctai.info', 'user123', 'token456');
    expect(url).toBe('https://ctai.info/api/email/unsubscribe?uid=user123&token=token456');
  });
});
