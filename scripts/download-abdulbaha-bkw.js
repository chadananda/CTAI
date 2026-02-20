#!/usr/bin/env node
/**
 * Download Abdu'l-Baha Best-Known-Works from OceanOfLights.org
 * Fetches Nuxt static payloads, extracts text, writes markdown files.
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const OUT_DIR = resolve('data/Best-Known-Works/Abdul-Baha');
const BASE = 'https://oceanoflights.org/_nuxt/static/v1';

// Catalog: bkw ID → { translitTitle, englishTitle, lang to download }
// From README.md + OceanOfLights probing
const CATALOG = {
  '02': {
    title: "Alváḥ-i-Tablíghí-i-Imríká",
    english: "Tablets of the Divine Plan",
    langs: ['ar'], // en exists but is authorized translation
  },
  '03': {
    title: "Alváḥ-i-Vaṣáyá",
    english: "Will and Testament",
    langs: ['fa', 'ar'],
  },
  '05': {
    title: "Lawḥ-i-Aflákíyyih",
    english: "Tablet of the Universe",
    langs: ['ar'], // en is provisional
  },
  '06': {
    title: "Lawḥ-i-'Ahd va Míthaq",
    english: "Tablet of the Covenant",
    langs: ['fa'],
  },
  '07': {
    title: "Lawḥ-i-'Ammih",
    english: "Tablet to the Aunt",
    langs: ['fa'],
  },
  '08': {
    title: "Lawḥ-i-Áyát",
    english: "Tablet of the Verses",
    langs: ['ar'],
  },
  '09': {
    title: "Lawḥ-i-Du-Nidáy-i-Faláḥ va Najáḥ",
    english: "Tablet of the Two Calls of Success and Salvation",
    langs: ['fa'],
  },
  '10': {
    title: "Lawḥ-i-Haft Sham'",
    english: "Tablet of Seven Candles",
    langs: ['fa', 'ar'],
  },
  '11': {
    title: "Lawḥ-i-Hizár Baytí",
    english: "Tablet of a Thousand Verses",
    langs: ['fa'],
  },
  '13': {
    title: "Lawḥ-i-Láhih",
    english: "Tablet to The Hague",
    langs: ['ar'], // en is authorized translation
  },
  '14': {
    title: "Lawḥ-i-Maḥfil-i-Shawr",
    english: "Tablet of Consultation",
    langs: ['fa'],
  },
  '15': {
    title: "Lawḥ-i-Khurasán",
    english: "Tablet to Khurasan",
    langs: ['fa'],
  },
  '16': {
    title: "Lawḥ-i-Muḥabbat",
    english: "Tablet of Love",
    langs: ['ar'],
  },
  '17': {
    title: "Lawḥ-i-Tanzíh va Taqdís",
    english: "Tablet of Chastity and Purity",
    langs: ['fa'],
  },
  '18': {
    title: "Lawḥ-i-Tarbíyat",
    english: "Tablet of Education",
    langs: ['fa'],
  },
  '19': {
    title: "Madaníyyih",
    english: "Secret of Divine Civilization",
    langs: ['fa', 'ar'],
  },
  '21': {
    title: "Maqáliy-i-Sayyáḥ",
    english: "A Traveler's Narrative",
    langs: ['fa'],
  },
  '22': {
    title: "Mufávaḍát",
    english: "Some Answered Questions",
    langs: ['en'], // only English available
  },
  '23': {
    title: "Sharḥ-i-Faṣṣ-i-Nigín-i-Ism-i-A'ẓam",
    english: "Explanation of the Greatest Name Emblem",
    langs: ['fa'],
  },
  '24': {
    title: "Sharḥ-i-Shuhadáy-i-Yazd va Iṣfahán",
    english: "Commentary on the Martyrs of Yazd and Isfahan",
    langs: ['fa'],
  },
  '25': {
    title: "Tadhkiratu'l-Vafá",
    english: "Memorials of the Faithful",
    langs: ['fa'],
  },
  '26': {
    title: "Tadhkiratu'l-Vafá",
    english: "Memorials of the Faithful",
    langs: ['en'], // only English available
  },
  '27': {
    title: "Tafsír-i-Bismi'lláhi'r-Raḥmáni'r-Raḥím",
    english: "Commentary on Bismillah",
    langs: ['ar'],
  },
  '28': {
    title: "Tafsír-i-Kuntu Kanzan Makhfíyya",
    english: "Commentary on the Hidden Treasure",
    langs: ['fa'],
  },
  '29': {
    title: "Ad'íyyih va Munáját",
    english: "Prayers and Supplications",
    langs: ['ar'],
  },
};

/** Convert Nuxt AST body to plain text */
function astToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node)) return node.map(astToText).join('');
  if (node.children) {
    const inner = node.children.map(astToText).join('');
    const tag = node.tag;
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') return `\n## ${inner}\n\n`;
    if (tag === 'h4' || tag === 'h5') return `\n### ${inner}\n\n`;
    if (tag === 'p') return `${inner}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'blockquote') return `> ${inner}\n\n`;
    if (tag === 'em' || tag === 'i') return `*${inner}*`;
    if (tag === 'strong' || tag === 'b') return `**${inner}**`;
    if (tag === 'li') return `- ${inner}\n`;
    if (tag === 'ul' || tag === 'ol') return `\n${inner}\n`;
    if (tag === 'sup') return `[^${inner}]`;
    if (tag === 'ool-icon-link') return '';
    if (tag === 'span') return inner;
    if (tag === 'div') return `${inner}\n`;
    return inner;
  }
  return '';
}

/** Extract data from Nuxt JSONP payload string */
function parsePayload(raw) {
  const code = raw
    .replace(/^__NUXT_JSONP__\([^,]+,\s*/, 'return ')
    .replace(/\);?\s*$/, ';');
  try {
    const fn = new Function(code);
    return fn();
  } catch (e) {
    console.error('  Parse error:', e.message);
    return null;
  }
}

/** Fetch a single payload */
async function fetchPayload(bkwId, lang) {
  const slug = `abdul-baha-bkw${bkwId}-${lang}`;
  const url = `${BASE}/${slug}/payload.js`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const raw = await res.text();
  if (!raw || raw.length < 100) return null;

  const parsed = parsePayload(raw);
  if (!parsed?.data?.[0]?.publicDocument) return null;

  const doc = parsed.data[0].publicDocument;
  const meta = doc.metadata || {};
  const text = astToText(doc.body).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    slug,
    nativeTitle: meta.title || '',
    language: meta.language || lang,
    textLength: doc.textLength || 0,
    wordCount,
    text,
    sourceUrl: `https://oceanoflights.org/${slug}/`,
  };
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  let downloaded = 0;
  let failed = 0;

  // Deduplicate: bkw25-fa and bkw26-en are both Tadhkiratu'l-Vafa
  // Download them separately but note the overlap
  const seen = new Set();

  for (const [bkwId, info] of Object.entries(CATALOG)) {
    for (const lang of info.langs) {
      const slug = `abdul-baha-bkw${bkwId}-${lang}`;
      if (seen.has(slug)) continue;
      seen.add(slug);

      process.stdout.write(`Fetching ${slug}...`);
      const data = await fetchPayload(bkwId, lang);
      if (!data) {
        console.log(' FAILED');
        failed++;
        continue;
      }

      const filename = `${slug}.md`;
      const isEnglish = lang === 'en';

      // Build frontmatter
      const fm = ['---'];
      fm.push(`title: "${info.title.replace(/"/g, '\\"')}"`);
      if (!isEnglish) {
        // title_original is the native script from the payload
        fm.push(`title_original: "${data.nativeTitle.replace(/"/g, '\\"')}"`);
      }
      fm.push(`title_english: "${info.english.replace(/"/g, '\\"')}"`);
      fm.push(`author: "'Abdu'l-Bahá"`);
      fm.push(`language: "${lang}"`);
      fm.push(`source_url: "${data.sourceUrl}"`);
      fm.push(`ocean_id: "${slug}"`);
      fm.push(`has_english_translation: ${info.langs.includes('en') || ['02', '05', '10', '13', '19', '21', '25', '26'].includes(bkwId)}`);
      fm.push('---');

      const content = `${fm.join('\n')}\n\n${data.text}\n`;
      writeFileSync(join(OUT_DIR, filename), content);
      downloaded++;
      console.log(` OK (${data.wordCount} words) → ${filename}`);

      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\nDone: ${downloaded} downloaded, ${failed} failed.`);
}

main().catch(console.error);
