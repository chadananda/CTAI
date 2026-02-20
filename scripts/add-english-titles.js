#!/usr/bin/env node
/**
 * Add title_english to all work JSON files.
 * Uses a comprehensive manual map of scholarly English translations.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const WORKS_DIR = resolve('src/content/works');

// Comprehensive English translations keyed by doc_id
// null = title is already in English, no subtitle needed
const TITLE_ENGLISH = {
  // ═══════════════════════════════════════════════════
  // Bahá'u'lláh
  // ═══════════════════════════════════════════════════
  'az-bagh-i-ilahi-fa': 'From the Divine Garden',
  'baz-av-u-bidih-jami-fa': 'Come, Bring the Cup',
  'halih-halih-ya-bisharat-fa': 'O Glad Tidings!',
  'hur-i-ujab-ar': 'The Wondrous Maiden',
  'kitab-i-badi-fa': 'The Wondrous Book',
  'lawh-i-amvaj-fa': 'Tablet of the Waves',
  'lawh-i-ashiq-va-mashuq-ar': 'Tablet of the Lover and the Beloved',
  'lawh-i-ashiq-va-mashuq-fa': 'Tablet of the Lover and the Beloved',
  'lawh-i-ayiy-i-nur-ar': 'Tablet of the Verse of Light',
  'lawh-i-baqa-ar': 'Tablet of Eternity',
  'lawh-i-basitatul-haqiqih-fa': 'Tablet of the Uncompounded Reality',
  'lawh-i-bismilih-fa': 'Tablet of "In the Name of God"',
  'lawh-i-fitnih-ar': 'Tablet of the Test',
  'lawh-i-ghulamul-khuld-ar': 'Tablet of the Immortal Youth',
  'lawh-i-ghulamul-khuld-fa': 'Tablet of the Immortal Youth',
  'lawh-i-habib-ar': 'Tablet for Habib',
  'lawh-i-haqq-ar': 'Tablet of the True One',
  'lawh-i-hawdaj-ar': 'Tablet of the Howdah',
  'lawh-i-hirtik-ar': 'Tablet of Hirtik',
  'lawh-i-huriyyih-ar': 'Tablet of the Maiden of Heaven',
  'lawh-i-kullut-taam-ar': 'Tablet of All Food',
  'lawh-i-mawlud-ar': 'Tablet of the Newborn',
  'lawh-i-mubahilih-fa': 'Tablet of the Mutual Imprecation',
  'lawh-i-nuqtih-fa': 'Tablet of the Point',
  'lawh-i-pisar-amm-fa': 'Tablet of the Cousin',
  'lawh-i-qina-fa': 'Tablet of the Veil',
  'lawh-i-raqsha-ar': 'Tablet of the She-Serpent',
  'lawh-i-rasul-ar': 'Tablet for Rasul',
  'lawh-i-ruh-ar': 'Tablet of the Spirit',
  'lawh-i-ruya-ar': 'Tablet of the Vision',
  'lawh-i-salman-ii-fa': 'Tablet for Salman II',
  'lawh-i-samsun-ar': 'Tablet of Samsun',
  'lawh-i-sayyah-ar': 'Tablet of the Traveler',
  'lawh-i-tuqa-ar': 'Tablet of Piety',
  'madinatur-rida-ar': 'City of Radiant Acquiescence',
  'mathnavi-ar': 'Couplets',
  'mathnavi-fa': 'Couplets',
  'qasidiy-i-varqaiyyih-ar': 'Ode of the Dove',
  'rashh-i-ama-fa': 'Sprinkling from the Divine Cloud',
  'ridvanul-iqrar-ar': 'The Paradise of Confession',
  'sahifiy-i-shattiyyih-fa': 'Book of the River',
  'saqi-az-ghayb-i-baqa-fa': 'Cupbearer of the Unseen Eternity',
  'shikkar-shikan-shavand-fa': 'Sugar-Shattering',
  'subhana-rabbiyal-ala-ar': 'Glorified Is My Lord, the Most High',
  'subhanaka-ya-hu-ar': 'Praised Be Thou, O He!',
  'suratu-llah-ar': 'Sura of God',
  'suriy-i-ahzan-ar': 'Sura of Sorrows',
  'suriy-i-amin-ar': 'Sura of the Trustee',
  'suriy-i-amr-ar': 'Sura of the Command',
  'suriy-i-arab-ar': 'Sura of the Arabs',
  'suriy-i-ashab-ar': 'Sura of the Companions',
  'suriy-i-asma-fa': 'Sura of the Names',
  'suriy-i-dhibh-ar': 'Sura of the Sacrifice',
  'suriy-i-dhikr-ar': 'Sura of Remembrance',
  'suriy-i-fadl-ar': 'Sura of Grace',
  'suriy-i-hajj-i-ar': 'Sura of Pilgrimage I',
  'suriy-i-hajj-ii-ar': 'Sura of Pilgrimage II',
  'suriy-i-hifz-ar': 'Sura of Protection',
  'suriy-i-hijr-ar': 'Sura of Separation',
  'suriy-i-ismunal-mursil-ar': 'Sura of the Name of the Sender',
  'suriy-i-khitab-ar': 'Sura of the Address',
  'suriy-i-maani-ar': 'Sura of Meanings',
  'suriy-i-man-ar': 'Sura of Denial',
  'suriy-i-nush-ar': 'Sura of Counsel',
  'suriy-i-qadir-ar': 'Sura of the Omnipotent',
  'suriy-i-qahir-ar': 'Sura of the Almighty',
  'suriy-i-qalam-ar': 'Sura of the Pen',
  'suriy-i-sabr-ar': 'Sura of Patience',
  'suriy-i-sultan-ar': 'Sura of the King',
  'suriy-i-ziyarih-ar': 'Sura of Visitation',
  'suriy-i-zubur-ar': 'Sura of the Psalms',
  'suriy-i-zuhur-ar': 'Sura of the Manifestation',
  'tafsir-i-hu-ar': "Commentary on 'He'",
  'tafsir-i-hurufat-i-muqattaih-ar': 'Commentary on the Isolated Letters',
  'ziyarat-namiy-i-awliya-ar': 'Tablet of Visitation for the Saints',
  'ziyarat-namiy-i-bayt-ar': 'Tablet of Visitation for the House',
  'ziyarat-namiy-i-maryam-ar': 'Tablet of Visitation for Maryam',
  'ziyarat-namiy-i-siyyidush-shuhada-ar': 'Tablet of Visitation for the King of Martyrs',

  // ═══════════════════════════════════════════════════
  // The Bab — works already containing English in title
  // ═══════════════════════════════════════════════════
  'commentary-on-the-surih-of-kawthar-ar': null, // already English
  'commentary-on-the-surih-of-val-asr-ar': null, // already English
  'khasail-i-sabih-seven-qualifications-ar': 'Seven Qualifications',
  'kitabur-ruh-book-of-spirit-ar': 'Book of the Spirit',
  'lawh-i-hurufat-tablet-of-the-letters-fa': 'Tablet of the Letters',
  'risaliy-i-adliyyih-epistle-of-justice-fa': 'Epistle of Justice',
  'risaliy-i-dhahabiyyih-golden-epistle-ar': 'Golden Epistle',
  'sahifiy-i-baynil-haramayn-epistle-between-the-two-shrines-ar': 'Epistle between the Two Shrines',
  'sahifiy-i-makhzumiyyih-ar': 'Epistle to Makhzum',
  'sahifiy-i-radaviyyih-ar': 'Epistle of Radaviyyih',
  'sahify-i-jafariyyih-ar': "Epistle to Ja'far",
  'suriy-i-tawhid-commentary-of-the-surih-of-monotheism-ar': 'Commentary on the Sura of Monotheism',
  'tafsir-i-nubuvvat-i-khassih-commentary-on-muhammads-specific-mission-ar': "Commentary on Muhammad's Specific Mission",
  'ziyarat-i-shah-abdul-azim-visitation-to-shah-abdul-azim-ar': "Visitation to Shah 'Abdu'l-'Azim",

  // ═══════════════════════════════════════════════════
  // Shoghi Effendi
  // ═══════════════════════════════════════════════════
  'tawqi-i-mubarik-naw-ruz-101-be-lawh-i-qarn-ar': 'Blessed Message for Naw-Ruz 101 BE (Tablet of the Century)',
  'tawqi-i-mubarik-naw-ruz-101-be-lawh-i-qarn-fa': 'Blessed Message for Naw-Ruz 101 BE (Tablet of the Century)',
  'tawqi-i-mubarik-naw-ruz-108-be-fa': 'Blessed Message for Naw-Ruz 108 BE',
  'tawqi-i-mubarik-naw-ruz-110-be-fa': 'Blessed Message for Naw-Ruz 110 BE',
  'tawqi-i-mubarik-naw-ruz-111-be-fa': 'Blessed Message for Naw-Ruz 111 BE',
  'tawqi-i-mubarik-naw-ruz-113-be-extracts-fa': 'Blessed Message for Naw-Ruz 113 BE (Extracts)',
  'tawqi-i-mubarik-naw-ruz-88-be-fa': 'Blessed Message for Naw-Ruz 88 BE',
  'tawqi-i-mubarik-ridvan-105-be-fa': 'Blessed Message for Ridvan 105 BE',
  'tawqi-i-mubarik-ridvan-89-be-fa': 'Blessed Message for Ridvan 89 BE',

  // ═══════════════════════════════════════════════════
  // Scholarly — Mazindarani
  // ═══════════════════════════════════════════════════
  'mazindarani-asraru-l-athar-volume-1': 'Secrets of the Relics, Volume 1',
  'mazindarani-asraru-l-athar-volume-2': 'Secrets of the Relics, Volume 2',
  'mazindarani-asraru-l-athar-volume-3': 'Secrets of the Relics, Volume 3',
  'mazindarani-asraru-l-athar-volume-4': 'Secrets of the Relics, Volume 4',
  'mazindarani-asraru-l-athar-volume-5': 'Secrets of the Relics, Volume 5',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-1': 'History of the Manifestation of Truth, Volume 1',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-2': 'History of the Manifestation of Truth, Volume 2',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-3': 'History of the Manifestation of Truth, Volume 3',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-4': 'History of the Manifestation of Truth, Volume 4',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-5': 'History of the Manifestation of Truth, Volume 5',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-6': 'History of the Manifestation of Truth, Volume 6',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-7': 'History of the Manifestation of Truth, Volume 7',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-8': 'History of the Manifestation of Truth, Volume 8',
  'mazindarani-tarikh-i-zuhuru-l-haqq-volume-9': 'History of the Manifestation of Truth, Volume 9',

  // ═══════════════════════════════════════════════════
  // Scholarly — Davudi
  // ═══════════════════════════════════════════════════
  'davudi-uluhiyyat-on-divinity': 'On Divinity',
  'davudi-uluhiyyat-va-mazhariyyat-divinity-and-manifestation-volume-2': 'Divinity and Manifestation, Volume 2',
  'davudi-maqalat-i-davudi-collected-articles-corrected-edition': 'Collected Articles (Corrected Edition)',
  'davudi-maqalat-i-davudi-collected-articles-version-1': 'Collected Articles, Version 1',
  'davudi-maqalat-i-davudi-collected-articles-version-2': 'Collected Articles, Version 2',
  'davudi-shinasa-i-va-hasti-epistemology-and-ontology': 'Epistemology and Ontology',

  // ═══════════════════════════════════════════════════
  // Scholarly — Others
  // ═══════════════════════════════════════════════════
  'sulaymani-masabih-i-hidayat-lamps-of-guidance-volume-5': 'Lamps of Guidance, Volume 5',
  'sulaymani-masabih-i-hidayat-lamps-of-guidance-volume-6': 'Lamps of Guidance, Volume 6',
  'bushrui-tarikh-i-diyanat-i-baha-i-dar-khurasan-history-of-the-baha-i-faith-in-khorasan': "History of the Baha'i Faith in Khorasan",
};

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.endsWith('.json')) {
      files.push(full);
    }
  }
  return files;
}

let updated = 0;
let skipped = 0;
let missing = 0;

for (const filePath of walkDir(WORKS_DIR)) {
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const docId = data.doc_id;

  if (!docId) {
    console.warn(`  SKIP (no doc_id): ${filePath}`);
    skipped++;
    continue;
  }

  if (!(docId in TITLE_ENGLISH)) {
    console.warn(`  MISSING: ${docId} — "${data.title}"`);
    missing++;
    continue;
  }

  const englishTitle = TITLE_ENGLISH[docId];

  if (englishTitle === null) {
    // Title is already English — set title_english to null explicitly
    if (data.title_english === undefined) {
      data.title_english = null;
      writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      updated++;
    } else {
      skipped++;
    }
  } else {
    data.title_english = englishTitle;
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    updated++;
  }
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${missing} missing translations`);
if (missing > 0) {
  console.log('Add missing doc_ids to TITLE_ENGLISH map in this script.');
}
