import quranSuras from '../data/quran-suras.json';

/**
 * Convert transliterated sura name to URL slug.
 * Al-Fátiḥah → al-fatihah, Ál-i-ʻImrán → al-i-imran
 */
export function suraSlug(tname) {
  return tname
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritics (á→a, ḥ→h, etc.)
    .replace(/[\u02BB\u02BC\u2018\u2019\u2032\u0027]/g, '') // remove ʻayn, hamzah, quotes
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** All suras with pre-computed slugs */
export const suras = quranSuras.map(s => ({ ...s, slug: suraSlug(s.tname) }));

/** Lookup by slug */
export function suraBySlug(slug) {
  return suras.find(s => s.slug === slug);
}
