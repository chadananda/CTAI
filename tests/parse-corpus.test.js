import { describe, it, expect } from 'vitest';
import { slugify, parseFile, mergePairs, buildDocuments } from '../scripts/parse-corpus.js';

describe('slugify', () => {
  it('converts title to URL-safe slug', () => {
    expect(slugify('The Hidden Words')).toBe('the-hidden-words');
    expect(slugify('Kitab-i-Iqan')).toBe('kitab-i-iqan');
    expect(slugify("Kitáb-i-'Ahd")).toBe('kitab-i-ahd');
    expect(slugify('Prayers and Meditations')).toBe('prayers-and-meditations');
  });
});

describe('parseFile', () => {
  it('parses header-separator-translation pairs', () => {
    const content = `
[Test Work, 1, 10.0]
Arabic source text
===============
English translation

[Test Work, 2, 9.5]
Second source
===============
Second translation
`;
    const pairs = parseFile(content, { title: 'Test Work' });
    expect(pairs).toHaveLength(2);
    expect(pairs[0].source_text).toBe('Arabic source text');
    expect(pairs[0].translation).toBe('English translation');
    expect(pairs[0].header.index).toBe('1');
    expect(pairs[0].header.score).toBe(10.0);
    expect(pairs[1].header.score).toBe(9.5);
  });

  it('handles multi-line source and translation', () => {
    const content = `
[Work, 1, 10.0]
Line one
Line two
===============
Trans line one
Trans line two
`;
    const pairs = parseFile(content, { title: 'Work' });
    expect(pairs[0].source_text).toBe('Line one\nLine two');
    expect(pairs[0].translation).toBe('Trans line one\nTrans line two');
  });
});

describe('mergePairs', () => {
  it('merges short addressing headers with following content', () => {
    const pairs = [
      {
        header: { work: 'HW', index: '3', score: 10 },
        source_text: '(١) ﴿ يَا ابْنَ الرُّوْحِ ﴾',
        translation: '(1) O SON OF SPIRIT!',
      },
      {
        header: { work: 'HW', index: '4', score: 10 },
        source_text: 'فِي أَوَّلِ القَوْلِ امْلِكْ قَلْبًا',
        translation: 'My first counsel is this: Possess a pure, kindly and radiant heart',
      },
    ];
    const merged = mergePairs(pairs);
    expect(merged).toHaveLength(1);
    expect(merged[0].source_text).toContain('يَا ابْنَ الرُّوْحِ');
    expect(merged[0].source_text).toContain('فِي أَوَّلِ');
    expect(merged[0].translation).toContain('O SON OF SPIRIT');
    expect(merged[0].translation).toContain('My first counsel');
  });

  it('does not merge long content pairs', () => {
    const pairs = [
      {
        header: { work: 'Iqan', index: '1', score: 10 },
        source_text: 'A'.repeat(100),
        translation: 'B'.repeat(100),
      },
      {
        header: { work: 'Iqan', index: '2', score: 10 },
        source_text: 'C'.repeat(100),
        translation: 'D'.repeat(100),
      },
    ];
    const merged = mergePairs(pairs);
    expect(merged).toHaveLength(2);
  });
});

describe('buildDocuments', () => {
  it('creates document objects with correct fields', () => {
    const pairs = [
      {
        header: { work: 'Test', index: '1', score: 9.0 },
        source_text: 'مصدر',
        translation: 'source',
      },
    ];
    const docs = buildDocuments(pairs, {
      title: 'The Hidden Words',
      author: "Baha'u'llah",
      source_language: 'ar/fa',
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('the-hidden-words-1');
    expect(docs[0].slug).toBe('the-hidden-words');
    expect(docs[0].author).toBe("Baha'u'llah");
    expect(docs[0].source_lang).toBe('ar');
    expect(docs[0].pair_index).toBe(1);
    expect(docs[0].url).toBe('/corpus/the-hidden-words/1');
    expect(docs[0].full_text).toContain('مصدر');
    expect(docs[0].full_text).toContain('source');
  });
});
