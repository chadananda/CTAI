import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WORKS_DIR = path.resolve('src/content/works');

describe('works catalog output', () => {
  it('has generated JSON files', () => {
    const authors = fs.readdirSync(WORKS_DIR).filter(d =>
      fs.statSync(path.join(WORKS_DIR, d)).isDirectory()
    );
    expect(authors.length).toBeGreaterThan(0);
    for (const author of authors) {
      const files = fs.readdirSync(path.join(WORKS_DIR, author)).filter(f => f.endsWith('.json'));
      expect(files.length).toBeGreaterThan(0);
    }
  });

  it('includes required fields in each work', () => {
    const requiredFields = ['title', 'author', 'author_slug', 'language', 'doc_id'];
    const sampleDir = path.join(WORKS_DIR, 'bahaullah');
    const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 5)) {
      const data = JSON.parse(fs.readFileSync(path.join(sampleDir, file), 'utf-8'));
      for (const field of requiredFields) {
        expect(data[field], `${file} missing ${field}`).toBeDefined();
      }
    }
  });

  it('has source_preview for works with source text', () => {
    const sampleDir = path.join(WORKS_DIR, 'bahaullah');
    const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.json'));
    let hasPreview = 0;
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(sampleDir, file), 'utf-8'));
      if (data.source_preview) {
        hasPreview++;
        expect(data.source_preview.length).toBeGreaterThan(10);
        expect(data.source_preview.length).toBeLessThanOrEqual(500);
      }
    }
    expect(hasPreview).toBeGreaterThan(0);
  });

  it('has word_count as a positive number', () => {
    const sampleDir = path.join(WORKS_DIR, 'bahaullah');
    const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.json'));
    let hasWordCount = 0;
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(sampleDir, file), 'utf-8'));
      if (data.word_count) {
        hasWordCount++;
        expect(data.word_count).toBeGreaterThan(0);
        expect(typeof data.word_count).toBe('number');
      }
    }
    expect(hasWordCount).toBeGreaterThan(0);
  });

  it('has valid language codes', () => {
    const sampleDir = path.join(WORKS_DIR, 'bahaullah');
    const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(sampleDir, file), 'utf-8'));
      expect(['ar', 'fa']).toContain(data.language);
    }
  });

  it('has valid author_slug values', () => {
    const validSlugs = [
      'bahaullah', 'the-bab', 'abdul-baha', 'shoghi-effendi',
      'davudi', 'mazindarani', 'bushrui', 'sulaymani',
    ];
    const authors = fs.readdirSync(WORKS_DIR).filter(d =>
      fs.statSync(path.join(WORKS_DIR, d)).isDirectory()
    );
    for (const author of authors) {
      expect(validSlugs).toContain(author);
      const files = fs.readdirSync(path.join(WORKS_DIR, author)).filter(f => f.endsWith('.json'));
      for (const file of files.slice(0, 3)) {
        const data = JSON.parse(fs.readFileSync(path.join(WORKS_DIR, author, file), 'utf-8'));
        expect(data.author_slug).toBe(author);
      }
    }
  });

  it('scholarly works have category and translation_style', () => {
    const scholarlyDirs = ['davudi', 'mazindarani', 'bushrui', 'sulaymani'];
    for (const dir of scholarlyDirs) {
      const dirPath = path.join(WORKS_DIR, dir);
      if (!fs.existsSync(dirPath)) continue;
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8'));
        expect(data.category).toBe('scholarly');
        expect(data.translation_style).toBe('modern');
      }
    }
  });

  it('sacred works have category sacred and translation_style archaic', () => {
    const sampleDir = path.join(WORKS_DIR, 'bahaullah');
    const files = fs.readdirSync(sampleDir).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 5)) {
      const data = JSON.parse(fs.readFileSync(path.join(sampleDir, file), 'utf-8'));
      expect(data.category).toBe('sacred');
      expect(data.translation_style).toBe('archaic');
    }
  });
});
