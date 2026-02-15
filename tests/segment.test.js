import { describe, it, expect } from 'vitest';
import { authorSlug, docIdFromFilename, splitIntoParagraphs, chunkParagraphs } from '../scripts/segment.js';

describe('authorSlug', () => {
  it('maps known authors', () => {
    expect(authorSlug("Baha'u'llah")).toBe('bahaullah');
    expect(authorSlug('The Bab')).toBe('the-bab');
    expect(authorSlug("Abdu'l-Baha")).toBe('abdul-baha');
    expect(authorSlug('Shoghi Effendi')).toBe('shoghi-effendi');
  });

  it('falls back to generic slug', () => {
    expect(authorSlug('Unknown Author')).toBe('unknown-author');
  });
});

describe('docIdFromFilename', () => {
  it('creates clean doc IDs', () => {
    expect(docIdFromFilename('Kitáb-i-Aqdas-Most-Holy-Book-ar.md')).toBe(
      'kitab-i-aqdas-most-holy-book-ar',
    );
    expect(docIdFromFilename('Lawḥ-i-Karmil-ar.md')).toBe('lawh-i-karmil-ar');
  });
});

describe('splitIntoParagraphs', () => {
  it('splits on double newlines', () => {
    const text = 'Para one\n\nPara two\n\nPara three';
    const paras = splitIntoParagraphs(text);
    expect(paras).toHaveLength(3);
    expect(paras[0]).toBe('Para one');
  });

  it('filters empty paragraphs', () => {
    const text = '\n\n\nSome text\n\n\n\nMore text\n\n';
    const paras = splitIntoParagraphs(text);
    expect(paras).toHaveLength(2);
  });
});

describe('chunkParagraphs', () => {
  it('combines small paragraphs to target size', () => {
    const paras = ['Short one.', 'Short two.', 'Short three.'];
    const chunks = chunkParagraphs(paras, 100, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Short one.');
    expect(chunks[0]).toContain('Short three.');
  });

  it('splits oversized paragraphs', () => {
    const paras = ['A'.repeat(1500)];
    const chunks = chunkParagraphs(paras, 500, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000);
    }
  });

  it('respects paragraph boundaries', () => {
    const paras = ['A'.repeat(400), 'B'.repeat(400), 'C'.repeat(400)];
    const chunks = chunkParagraphs(paras, 500, 1000);
    // First two should not be combined (400+400+2 > 500)
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
