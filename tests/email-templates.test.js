import { describe, it, expect } from 'vitest';
import { completionEmailHtml, digestEmailHtml } from '../workers/translation-pipeline/email-templates.js';

describe('completionEmailHtml', () => {
  it('includes work title', () => {
    const html = completionEmailHtml({
      workTitle: 'Lawh-i-Ruh',
      translationUrl: 'https://ctai.info/translations/tr-123',
    });
    expect(html).toContain('Lawh-i-Ruh');
  });

  it('includes translation URL as link', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('href="https://ctai.info/translations/abc"');
  });

  it('shows PDF download links when pdfUrls provided', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
      pdfUrls: {
        sbsPara: 'https://r2.ctai.info/pdf/para.pdf',
        sbsSent: 'https://r2.ctai.info/pdf/sent.pdf',
        sbsNotes: 'https://r2.ctai.info/pdf/notes.pdf',
      },
    });
    expect(html).toContain('href="https://r2.ctai.info/pdf/para.pdf"');
    expect(html).toContain('href="https://r2.ctai.info/pdf/sent.pdf"');
    expect(html).toContain('href="https://r2.ctai.info/pdf/notes.pdf"');
    expect(html).toContain('Download PDFs');
  });

  it('shows fallback PDF text when no pdfUrls', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('Side-by-side by paragraph');
    expect(html).toContain('Side-by-side by sentence');
    expect(html).toContain('translator notes');
  });

  it('personalizes with sponsor name when provided', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
      sponsorName: 'Ahmad',
    });
    expect(html).toContain('Ahmad, your');
  });

  it('uses generic greeting when no sponsor name', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('Your translation');
    expect(html).not.toContain('undefined');
  });

  it('handles missing work title', () => {
    const html = completionEmailHtml({
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('your text');
  });

  it('includes public domain message', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('public domain');
    expect(html).toContain('permanent gift');
  });

  it('includes print-on-demand teaser', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('Print-on-demand');
    expect(html).toContain('Amazon');
  });

  it('includes CTAI footer', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
    });
    expect(html).toContain('ctai.info');
    expect(html).toContain('Committee Translation AI');
  });

  it('handles partial pdfUrls (only some formats)', () => {
    const html = completionEmailHtml({
      workTitle: 'Test',
      translationUrl: 'https://ctai.info/translations/abc',
      pdfUrls: { sbsPara: 'https://r2.ctai.info/pdf/para.pdf' },
    });
    expect(html).toContain('href="https://r2.ctai.info/pdf/para.pdf"');
    // Missing formats should not produce broken links
    expect(html).not.toContain('undefined');
  });
});

describe('digestEmailHtml', () => {
  it('includes new translations section', () => {
    const html = digestEmailHtml({
      newTranslations: [
        { id: 'tr-1', work_title: 'Lawh-i-Ruh', style: 'literary' },
        { id: 'tr-2', work_title: 'Hidden Words', style: 'literal' },
      ],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('New This Week');
    expect(html).toContain('Lawh-i-Ruh');
    expect(html).toContain('Hidden Words');
    expect(html).toContain('href="https://ctai.info/translations/tr-1"');
  });

  it('includes popular translations section', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [
        { id: 'tr-1', work_title: 'Popular Work', view_count: 1234 },
      ],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('Most Popular');
    expect(html).toContain('Popular Work');
    expect(html).toContain('1,234');
  });

  it('shows fallback when no content', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('No new translations this week');
  });

  it('includes template variables for personalization', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('{{name}}');
    expect(html).toContain('{{unsubscribe_url}}');
  });

  it('includes unsubscribe link', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('Unsubscribe');
  });

  it('includes CTAI branding', () => {
    const html = digestEmailHtml({
      newTranslations: [],
      popular: [],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('CTAI Weekly Digest');
    expect(html).toContain('ctai.info');
  });

  it('shows both sections when both have data', () => {
    const html = digestEmailHtml({
      newTranslations: [{ id: 'tr-1', work_title: 'New Work', style: 'literary' }],
      popular: [{ id: 'tr-2', work_title: 'Popular Work', view_count: 500 }],
      origin: 'https://ctai.info',
    });
    expect(html).toContain('New This Week');
    expect(html).toContain('Most Popular');
    expect(html).not.toContain('No new translations');
  });
});
