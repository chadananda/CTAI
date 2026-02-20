import { describe, it, expect } from 'vitest';
import { translationCompleteEmail } from '../src/lib/resend.js';

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

  it('includes PDF format list', () => {
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
});
