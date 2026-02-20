#!/usr/bin/env node
/**
 * Fix straight quotes to proper curly quotes in all work JSON files.
 * In Bahá'í transliteration:
 *   \u2018 (LEFT SINGLE QUOTE) = 'ayn (\u0639)
 *   \u2019 (RIGHT SINGLE QUOTE) = hamza (\u0621) / possessive / iḍáfa connector
 *   \u201C / \u201D = curly double quotes
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const WORKS_DIR = resolve('src/content/works');

// Corrected titles with proper curly quotes (only entries that need fixing)
const TITLE_FIX = {
  'hur-i-ujab-ar': '\u1E24\u00FAr-i-\u2018Uj\u00E1b',
  'kitab-i-badi-fa': 'Kit\u00E1b-i-Bad\u00ED\u2018',
  'lawh-i-ashiq-va-mashuq-ar': 'Law\u1E25-i-\u2018\u00C1shiq-va-Ma\u2018sh\u00FAq',
  'lawh-i-ashiq-va-mashuq-fa': 'Law\u1E25-i-\u2018\u00C1shiq-va-Ma\u2018sh\u00FAq',
  'lawh-i-basitatul-haqiqih-fa': 'Law\u1E25-i-Bas\u00ED\u1E6Datu\u2019l-\u1E24aq\u00EDqih',
  'lawh-i-ghulamul-khuld-ar': 'Law\u1E25-i-Ghul\u00E1mu\u2019l-Khuld',
  'lawh-i-ghulamul-khuld-fa': 'Law\u1E25-i-Ghul\u00E1mu\u2019l-Khuld',
  'lawh-i-kullut-taam-ar': 'Law\u1E25-i-Kullu\u2019\u1E6D-\u1E6Ca\u2018\u00E1m',
  'lawh-i-pisar-amm-fa': 'Law\u1E25-i-Pisar-\u2018Amm',
  'lawh-i-qina-fa': 'Law\u1E25-i-Qin\u00E1\u2018',
  'lawh-i-ruya-ar': 'Law\u1E25-i-Ru\u2019y\u00E1',
  'madinatur-rida-ar': 'Mad\u00EDnatu\u2019r-Ri\u1E0D\u00E1',
  'qasidiy-i-varqaiyyih-ar': 'Qa\u1E63\u00EDdiy-i-Varq\u00E1\u2019\u00EDyyih',
  'rashh-i-ama-fa': 'Rash\u1E25-i-\u2018Am\u00E1',
  'ridvanul-iqrar-ar': 'Ri\u1E0Dv\u00E1nu\u2019l-Iqr\u00E1r',
  'subhana-rabbiyal-ala-ar': 'Sub\u1E25\u00E1na-Rabb\u00EDya\u2019l-A\u2018l\u00E1',
  'suriy-i-arab-ar': 'S\u00FAriy-i-A\u2018r\u00E1b',
  'suriy-i-asma-fa': 'S\u00FAriy-i-Asm\u00E1\u2019',
  'suriy-i-ismunal-mursil-ar': 'S\u00FAriy-i-Ismuna\u2019l-Mursil',
  'suriy-i-maani-ar': 'S\u00FAriy-i-Ma\u2018\u00E1n\u00ED',
  'suriy-i-man-ar': 'S\u00FAriy-i-Man\u2018',
  'tafsir-i-hurufat-i-muqattaih-ar': 'Tafs\u00EDr-i-\u1E24ur\u00FAf\u00E1t-i-Muqa\u1E6D\u1E6Da\u2018ih',
  'ziyarat-namiy-i-siyyidush-shuhada-ar': 'Z\u00EDy\u00E1rat-N\u00E1miy-i-Siyyidu\u2019sh-Shuahd\u00E1',

  // The Bab
  'commentary-on-the-surih-of-val-asr-ar': 'Commentary on the S\u00FArih of Va\u2019l-\u2018A\u1E63r',
  'khasail-i-sabih-seven-qualifications-ar': 'Kha\u1E63\u00E1\u2019il-i-Sab\u2018ih (Seven Qualifications)',
  'kitabur-ruh-book-of-spirit-ar': 'Kit\u00E1bu\u2019r-R\u00FA\u1E25 (Book of Spirit)',
  'risaliy-i-adliyyih-epistle-of-justice-fa': 'Ris\u00E1liy-i-\u2018Adl\u00EDyyih (Epistle of Justice)',
  'sahifiy-i-baynil-haramayn-epistle-between-the-two-shrines-ar': '\u1E62a\u1E25\u00EDfiy-i-Bayni\u2019l-\u1E24aramayn (Epistle between the two Shrines)',
  'sahify-i-jafariyyih-ar': '\u1E62a\u1E25\u00EDfy-i-Ja\u2018far\u00EDyyih',
  'tafsir-i-nubuvvat-i-khassih-commentary-on-muhammads-specific-mission-ar': 'Tafs\u00EDr-i-Nubuvvat-i-Kh\u00E1\u1E63\u1E63ih (Commentary on Mu\u1E25ammad\u2019s Specific Mission)',
  'ziyarat-i-shah-abdul-azim-visitation-to-shah-abdul-azim-ar': 'Z\u00EDy\u00E1rat-i-Sh\u00E1h-\u2018Abdu\u2019l-\u2018A\u1E93\u00EDm (Visitation to Sh\u00E1h \u2018Abdu\u2019l-\u2018A\u1E93\u00EDm)',

  // Shoghi Effendi
  'tawqi-i-mubarik-naw-ruz-101-be-lawh-i-qarn-ar': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 101 BE (Lawh-i-Qarn)',
  'tawqi-i-mubarik-naw-ruz-101-be-lawh-i-qarn-fa': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 101 BE (Lawh-i-Qarn)',
  'tawqi-i-mubarik-naw-ruz-108-be-fa': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 108 BE',
  'tawqi-i-mubarik-naw-ruz-110-be-fa': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 110 BE',
  'tawqi-i-mubarik-naw-ruz-111-be-fa': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 111 BE',
  'tawqi-i-mubarik-naw-ruz-113-be-extracts-fa': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 113 BE (Extracts)',
  'tawqi-i-mubarik-naw-ruz-88-be-fa': 'Tawqi\u2018-i-Mub\u00E1rik Naw-R\u00FAz 88 BE',
  'tawqi-i-mubarik-ridvan-105-be-fa': 'Tawqi\u2018-i-Mub\u00E1rik Ri\u1E0Dv\u00E1n 105 BE',
  'tawqi-i-mubarik-ridvan-89-be-fa': 'Tawqi\u2018-i-Mub\u00E1rik Ri\u1E0Dv\u00E1n 89 BE',

  // Scholarly
  'bushrui-tarikh-i-diyanat-i-baha-i-dar-khurasan-history-of-the-baha-i-faith-in-khorasan': 'T\u00E1r\u00EDkh-i-Diy\u00E1nat-i-Bah\u00E1\u2019\u00ED dar Khur\u00E1s\u00E1n (History of the Bah\u00E1\u2019\u00ED Faith in Khorasan)',
  'davudi-shinasa-i-va-hasti-epistemology-and-ontology': 'Shin\u00E1sa\u2019\u00ED va Hast\u00ED (Epistemology and Ontology)',
  'mazindarani-asraru-l-athar-volume-1': 'Asr\u00E1ru\u2019l-\u00C1th\u00E1r, Volume 1',
  'mazindarani-asraru-l-athar-volume-2': 'Asr\u00E1ru\u2019l-\u00C1th\u00E1r, Volume 2',
  'mazindarani-asraru-l-athar-volume-3': 'Asr\u00E1ru\u2019l-\u00C1th\u00E1r, Volume 3',
  'mazindarani-asraru-l-athar-volume-4': 'Asr\u00E1ru\u2019l-\u00C1th\u00E1r, Volume 4',
  'mazindarani-asraru-l-athar-volume-5': 'Asr\u00E1ru\u2019l-\u00C1th\u00E1r, Volume 5',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-1': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 1',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-2': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 2',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-3': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 3',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-4': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 4',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-5': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 5',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-6': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 6',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-7': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 7',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-8': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 8',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-9': 'T\u00E1r\u00EDkh-i-\u1E92uh\u00FAru\u2019l-\u1E24aqq, Volume 9',
};

// Fix title_english quotes
const ENGLISH_FIX = {
  'lawh-i-bismilih-fa': 'Tablet of \u201CIn the Name of God\u201D',
  'tafsir-i-hu-ar': 'Commentary on \u2018He\u2019',
  'sahify-i-jafariyyih-ar': 'Epistle to Ja\u2018far',
  'ziyarat-i-shah-abdul-azim-visitation-to-shah-abdul-azim-ar': 'Visitation to Sh\u00E1h \u2018Abdu\u2019l-\u2018A\u1E93\u00EDm',
  'bushrui-tarikh-i-diyanat-i-baha-i-dar-khurasan-history-of-the-baha-i-faith-in-khorasan': 'History of the Bah\u00E1\u2019\u00ED Faith in Khorasan',
  'tafsir-i-nubuvvat-i-khassih-commentary-on-muhammads-specific-mission-ar': 'Commentary on Mu\u1E25ammad\u2019s Specific Mission',
  'subhana-rabbiyal-ala-ar': 'Glorified Is My Lord, the Most High',
  'lawh-i-habib-ar': 'Tablet for \u1E24ab\u00EDb',
};

// Fix author names (old → new)
const AUTHOR_FIX = {
  "Baha'u'llah": 'Bah\u00E1\u2019u\u2019ll\u00E1h',
  "Aziz'ullah Sulaymani Ardakani": 'Aziz\u2019ull\u00E1h Sulaym\u00E1n\u00ED Ardak\u00E1n\u00ED',
  "Hasan Fu'adi Bushrui": 'Hasan Fu\u2019\u00E1d\u00ED Bushr\u00FA\u2019\u00ED',
  "Mirza Asad'ullah Fadil Mazindarani": 'M\u00EDrz\u00E1 Asad\u2019ull\u00E1h F\u00E1\u1E0Dil M\u00E1zindar\u00E1n\u00ED',
};

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walkDir(full));
    else if (entry.endsWith('.json')) files.push(full);
  }
  return files;
}

let updated = 0;
for (const filePath of walkDir(WORKS_DIR)) {
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const docId = data.doc_id;
  let changed = false;

  // Fix title
  if (docId && TITLE_FIX[docId]) {
    data.title = TITLE_FIX[docId];
    changed = true;
  }

  // Fix title_english
  if (docId && ENGLISH_FIX[docId]) {
    data.title_english = ENGLISH_FIX[docId];
    changed = true;
  }

  // Fix author
  if (data.author && AUTHOR_FIX[data.author]) {
    data.author = AUTHOR_FIX[data.author];
    changed = true;
  }

  if (changed) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    updated++;
  }
}

console.log(`Fixed curly quotes in ${updated} files.`);
