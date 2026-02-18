// Shared utilities for concordance pages

// Work name → abbreviation
const ABBR = {
  'Will and Testament': 'W&T',
  'Epistle to the Son of the Wolf': 'ESW',
  'Fire Tablet': 'Fire',
  'Gleanings': 'GWB',
  "Kitab-i-'Ahd": 'Ahd',
  'Kitab-i-Iqan': 'KIQ',
  'Prayers and Meditations': 'P&M',
  'Tablet of Ahmad': 'Ahmad',
  'Tablet of Carmel': 'Carmel',
  'Tablet of the Holy Mariner': 'Mariner',
  'The Hidden Words': 'HW',
  'Hidden Words': 'HW',
};

// Work slug → abbreviation (for pair_id → display)
const SLUG_ABBR = {
  'will-and-testament': 'W&T',
  'epistle-to-the-son-of-the-wolf': 'ESW',
  'fire-tablet': 'Fire',
  'gleanings': 'GWB',
  "kitab-i-ahd": 'Ahd',
  'kitab-i-iqan': 'KIQ',
  'prayers-and-meditations': 'P&M',
  'tablet-of-ahmad': 'Ahmad',
  'tablet-of-carmel': 'Carmel',
  'tablet-of-the-holy-mariner': 'Mariner',
  'the-hidden-words': 'HW',
};

/** Slugify an English phrase for URL: "Straight Path" → "straight-path" */
export function slugify(phrase) {
  return phrase
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Unslugify back to query form: "straight-path" → "straight path" */
export function unslugify(slug) {
  return slug.replace(/-/g, ' ');
}

/**
 * Parse pair_id into work slug and paragraph index.
 * Format: "{work-slug}-§{para_index}-{occurrence_index}"
 * Example: "epistle-to-the-son-of-the-wolf-§96-2" → { workSlug: "epistle-to-the-son-of-the-wolf", paraIndex: 96 }
 */
export function parsePairId(pairId) {
  if (!pairId) return null;
  const sectionIdx = pairId.indexOf('§');
  if (sectionIdx === -1) return null;
  const workSlug = pairId.slice(0, sectionIdx - 1); // -1 to skip the hyphen before §
  const rest = pairId.slice(sectionIdx + 1); // after §
  const paraIndex = parseInt(rest, 10);
  if (!paraIndex) return null;
  return { workSlug, paraIndex };
}

/** Build paragraph page URL from pair_id */
export function paraUrl(pairId) {
  const parsed = parsePairId(pairId);
  if (!parsed) return null;
  return `/examples/${parsed.workSlug}/${parsed.paraIndex}/`;
}

/** Convert pair_id to abbreviated display: "ESW §96" */
export function refToDisplay(pairId) {
  const parsed = parsePairId(pairId);
  if (!parsed) return pairId;
  const abbr = SLUG_ABBR[parsed.workSlug] || parsed.workSlug;
  return `${abbr} §${parsed.paraIndex}`;
}

/** Convert ref string "Epistle to the Son of the Wolf §96§2" to abbreviated display */
export function refStringToDisplay(ref) {
  if (!ref) return '';
  const parts = ref.split('§');
  if (parts.length < 2) return ref;
  const work = parts[0].trim();
  const pairIdx = parts[1];
  const abbr = ABBR[work] || work;
  return `${abbr} §${pairIdx}`;
}

/** Convert ref string to paragraph URL */
export function refStringToUrl(ref) {
  if (!ref) return null;
  const parts = ref.split('§');
  if (parts.length < 2) return null;
  const work = parts[0].trim();
  const pairIdx = parseInt(parts[1], 10);
  if (!pairIdx) return null;
  // Convert work name to slug
  const slug = work.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `/examples/${slug}/${pairIdx}/`;
}

// ── D1/SQLite query helpers ──
// Re-export from concordance.js to share the same DB connection and adapter logic
export { resolveDb, queryAll, queryFirst } from './concordance.js';

export { ABBR, SLUG_ABBR };
