#!/usr/bin/env node
/**
 * Parse Tanzil quran-data.xml metadata + quran-uthmani.xml text
 * to produce src/data/quran-suras.json for the translations page.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Parse sura metadata from quran-data.xml
const metaXml = readFileSync(join(root, 'data/Islam/quran-data.xml'), 'utf8');
const suraRe = /<sura\s+index="(\d+)"\s+ayas="(\d+)"\s+start="\d+"\s+name="([^"]+)"\s+tname="([^"]+)"\s+ename="([^"]+)"\s+type="([^"]+)"\s+order="(\d+)"/g;

const suras = [];
let m;
while ((m = suraRe.exec(metaXml)) !== null) {
  suras.push({
    index: parseInt(m[1]),
    ayas: parseInt(m[2]),
    name: m[3],       // Arabic
    tname: m[4],      // transliteration
    ename: m[5],      // English
    type: m[6],       // Meccan/Medinan
    order: parseInt(m[7]),  // revelation order
  });
}

// Extract first few verses + word count per sura from uthmani text
const textXml = readFileSync(join(root, 'data/Islam/quran-uthmani.xml'), 'utf8');
const suraBlocks = textXml.split(/<sura\s/).slice(1);

for (const block of suraBlocks) {
  const idxMatch = block.match(/index="(\d+)"/);
  if (!idxMatch) continue;
  const idx = parseInt(idxMatch[1]);
  const sura = suras.find(s => s.index === idx);
  if (!sura) continue;

  // Collect all verse texts
  const ayaRe = /<aya\s+index="\d+"\s+text="([^"]+)"/g;
  let am;
  let wordCount = 0;
  const verses = [];
  while ((am = ayaRe.exec(block)) !== null) {
    const text = am[1];
    wordCount += text.split(/\s+/).length;
    if (verses.length < 3) verses.push(text);
  }
  sura.first_verse = verses[0] || '';
  sura.preview = verses.join(' ');
  sura.word_count = wordCount;
}

// Correct transliterations with proper diacritical marks
// ʻ (U+02BB) = ʻayn (ع), ʼ (U+02BC) = hamzah (ء)
const diacritics = {
  1: "Al-Fátiḥah", 2: "Al-Baqarah", 3: "Ál-i-ʻImrán", 4: "An-Nisáʼ",
  5: "Al-Máʼidah", 6: "Al-Anʻám", 7: "Al-Aʻráf", 8: "Al-Anfál",
  9: "At-Tawbah", 10: "Yúnus", 11: "Húd", 12: "Yúsuf",
  13: "Ar-Raʻd", 14: "Ibráhím", 15: "Al-Ḥijr", 16: "An-Naḥl",
  17: "Al-Isráʼ", 18: "Al-Kahf", 19: "Maryam", 20: "Ṭá-Há",
  21: "Al-Anbiyáʼ", 22: "Al-Ḥajj", 23: "Al-Muʼminún", 24: "An-Núr",
  25: "Al-Furqán", 26: "Ash-Shuʻaráʼ", 27: "An-Naml", 28: "Al-Qaṣaṣ",
  29: "Al-ʻAnkabút", 30: "Ar-Rúm", 31: "Luqmán", 32: "As-Sajdah",
  33: "Al-Aḥzáb", 34: "Sabaʼ", 35: "Fáṭir", 36: "Yá-Sín",
  37: "Aṣ-Ṣáffát", 38: "Ṣád", 39: "Az-Zumar", 40: "Al-Gháfir",
  41: "Fuṣṣilat", 42: "Ash-Shúrá", 43: "Az-Zukhruf", 44: "Ad-Dukhán",
  45: "Al-Játhiyah", 46: "Al-Aḥqáf", 47: "Muḥammad", 48: "Al-Fatḥ",
  49: "Al-Ḥujurát", 50: "Qáf", 51: "Adh-Dháriyát", 52: "Aṭ-Ṭúr",
  53: "An-Najm", 54: "Al-Qamar", 55: "Ar-Raḥmán", 56: "Al-Wáqiʻah",
  57: "Al-Ḥadíd", 58: "Al-Mujádilah", 59: "Al-Ḥashr", 60: "Al-Mumtaḥanah",
  61: "Aṣ-Ṣaff", 62: "Al-Jumuʻah", 63: "Al-Munáfiqún", 64: "At-Taghábun",
  65: "Aṭ-Ṭaláq", 66: "At-Taḥrím", 67: "Al-Mulk", 68: "Al-Qalam",
  69: "Al-Ḥáqqah", 70: "Al-Maʻárij", 71: "Núḥ", 72: "Al-Jinn",
  73: "Al-Muzzammil", 74: "Al-Muddaththir", 75: "Al-Qiyámah", 76: "Al-Insán",
  77: "Al-Mursalát", 78: "An-Nabaʼ", 79: "An-Náziʻát", 80: "ʻAbasa",
  81: "At-Takwír", 82: "Al-Infiṭár", 83: "Al-Muṭaffifín", 84: "Al-Inshiqáq",
  85: "Al-Burúj", 86: "Aṭ-Ṭáriq", 87: "Al-Aʻlá", 88: "Al-Gháshiyah",
  89: "Al-Fajr", 90: "Al-Balad", 91: "Ash-Shams", 92: "Al-Layl",
  93: "Aḍ-Ḍuḥá", 94: "Ash-Sharḥ", 95: "At-Tín", 96: "Al-ʻAlaq",
  97: "Al-Qadr", 98: "Al-Bayyinah", 99: "Az-Zalzalah", 100: "Al-ʻÁdiyát",
  101: "Al-Qáriʻah", 102: "At-Takáthur", 103: "Al-ʻAṣr", 104: "Al-Humazah",
  105: "Al-Fíl", 106: "Quraysh", 107: "Al-Máʻún", 108: "Al-Kawthar",
  109: "Al-Káfirún", 110: "An-Naṣr", 111: "Al-Masad", 112: "Al-Ikhláṣ",
  113: "Al-Falaq", 114: "An-Nás",
};

for (const s of suras) {
  if (diacritics[s.index]) s.tname = diacritics[s.index];
}

console.log(`Parsed ${suras.length} suras, ${suras.reduce((a, s) => a + s.ayas, 0)} total verses`);

mkdirSync(join(root, 'src/data'), { recursive: true });
writeFileSync(join(root, 'src/data/quran-suras.json'), JSON.stringify(suras, null, 2));
console.log('Wrote src/data/quran-suras.json');
