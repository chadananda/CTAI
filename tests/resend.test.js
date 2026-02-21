import { describe, it, expect, vi } from 'vitest';
import { translationCompleteEmail, digestEmailHtml } from '../src/lib/resend.js';

describe('translationCompleteEmail', () => {
  it('generates email with work title', () => {
    const email = translationCompleteEmail({
      workTitle: 'Lawh-i-Ruh',
      translationId: 'tr-123',
      origin: 'https://ctai.info',
    });
    expect(email.subject).toContain('Lawh-i-Ruh');
    expect(email.html).toContain('Lawh-i-Ruh');
    expect(email.html).toContain('https://ctai.info/translations/tr-123');
  });

  it('handles missing work title', () => {
    const email = translationCompleteEmail({
      translationId: 'tr-456',
      origin: 'https://ctai.info',
    });
    expect(email.subject).toContain('Untitled');
    expect(email.html).toContain('your text');
  });

  it('includes fallback PDF format list when no pdfUrls', () => {
    const email = translationCompleteEmail({
      workTitle: 'Test',
      translationId: 'tr-789',
      origin: 'https://ctai.info',
    });
    expect(email.html).toContain('Side-by-side by paragraph');
    expect(email.html).toContain('Side-by-side by sentence');
    expect(email.html).toContain('translator notes');
  });

  it('uses correct view URL', () => {
    const email = translationCompleteEmail({
      workTitle: 'Test',
      translationId: 'abc-def',
      origin: 'https://example.com',
    });
    expect(email.html).toContain('href="https://example.com/translations/abc-def"');
  });

  it('shows actual PDF links when pdfUrls provided', () => {
    const email = translationCompleteEmail({
      workTitle: 'Test',
      translationId: 'tr-pdf',
      origin: 'https://ctai.info',
      pdfUrls: {
        sbsPara: 'https://r2.ctai.info/para.pdf',
        sbsSent: 'https://r2.ctai.info/sent.pdf',
        sbsNotes: 'https://r2.ctai.info/notes.pdf',
      },
    });
    expect(email.html).toContain('href="https://r2.ctai.info/para.pdf"');
    expect(email.html).toContain('href="https://r2.ctai.info/sent.pdf"');
    expect(email.html).toContain('href="https://r2.ctai.info/notes.pdf"');
    expect(email.html).toContain('Download PDFs');
  });

  it('personalizes with sponsor name', () => {
    const email = translationCompleteEmail({
      workTitle: 'Test',
      translationId: 'tr-sponsor',
      origin: 'https://ctai.info',
      sponsorName: 'Ahmad',
    });
    expect(email.html).toContain('Ahmad, your');
  });

  it('uses generic greeting without sponsor name', () => {
    const email = translationCompleteEmail({
      workTitle: 'Test',
      translationId: 'tr-no-sponsor',
      origin: 'https://ctai.info',
    });
    expect(email.html).toMatch(/Your translation/);
    expect(email.html).not.toContain('null');
  });

  it('includes public domain message', () => {
    const email = translationCompleteEmail({
      workTitle: 'Test',
      translationId: 'tr-pd',
      origin: 'https://ctai.info',
    });
    expect(email.html).toContain('public domain');
  });

  it('uses new subject line format', () => {
    const email = translationCompleteEmail({
      workTitle: 'Lawh-i-Ruh',
      translationId: 'tr-subj',
      origin: 'https://ctai.info',
    });
    expect(email.subject).toBe('Translation complete: Lawh-i-Ruh');
  });
});

describe('digestEmailHtml', () => {
  it('renders new translations', () => {
    const html = digestEmailHtml({
      newTranslations: [{ id: 'tr-1', work_title: 'Test Work', style: 'literary' }],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('New This Week');
    expect(html).toContain('Test Work');
  });

  it('renders popular translations', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [{ id: 'tr-2', work_title: 'Popular', view_count: 999 }],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('Most Popular');
    expect(html).toContain('Popular');
  });

  it('shows fallback when empty', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('No new translations this week');
  });

  it('includes personalization placeholders', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('{{name}}');
    expect(html).toContain('{{unsubscribe_url}}');
  });
});
