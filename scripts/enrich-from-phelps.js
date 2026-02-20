#!/usr/bin/env node
/**
 * Enrich works catalog JSONs with descriptions from the Phelps inventory.
 * Parses the 58K-line Phelps file, matches entries to catalog works by title,
 * and writes abstract + subjects into each work's JSON.
 *
 * Usage: node scripts/enrich-from-phelps.js [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const PHELPS = path.resolve('data/Best-Known-Works/Steven Phelps - A Partial Inventory of the Works of the Central Figures of the Bahai Faith.md');
const WORKS_DIR = path.resolve('src/content/works');
const DRY_RUN = process.argv.includes('--dry-run');

/** Strip Unicode diacriticals */
function strip(s) {
	return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normalize a title for fuzzy matching */
function norm(s) {
	return strip(s)
		.toLowerCase()
		.replace(/[''ʼ`'\u2018\u2019\u02BC]/g, '')
		.replace(/\(.*?\)/g, '')
		.replace(/[^a-z0-9]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Manual overrides for tricky matches: catalog doc_id → Phelps ID */
const MANUAL_MATCHES = {
	// Baha'u'llah
	'lawh-i-kullut-taam-ar': 'BH00267',
	'suriy-i-sultan-ar': 'BH00061',
	'tafsir-i-hurufat-i-muqattaih-ar': 'BH00020',
	'lawh-i-ayiy-i-nur-ar': 'BH00020', // same work as Tafsir-i-Hurufat
	'suriy-i-hajj-i-ar': 'BH00044',
	'suriy-i-hajj-ii-ar': 'BH00095',
	'lawh-i-ashiq-va-mashuq-ar': 'BH00073',
	'lawh-i-ashiq-va-mashuq-fa': 'BH00073',
	'kitab-i-badi-fa': 'BH00004',
	'sahifiy-i-shattiyyih-fa': 'BH00041',
	'lawh-i-basitatul-haqiqih-fa': 'BH00046',
	'rashh-i-ama-fa': 'BH00042',
	'lawh-i-mubahilih-fa': 'BH00457',
	'lawh-i-pisar-amm-fa': 'BH00052',
	'lawh-i-salman-ii-fa': 'BH00048',
	'lawh-i-samsun-ar': 'BH00093',
	'lawh-i-ghulamul-khuld-ar': 'BH00729',
	'lawh-i-ghulamul-khuld-fa': 'BH00729',
	'subhanaka-ya-hu-ar': 'BH00759',
	'suratu-llah-ar': 'BH00845',
	'lawh-i-bismilih-fa': 'BH00528',
	'lawh-i-habib-ar': 'BH00076', // = Suriy-i-Ashab
	'mathnavi-ar': 'BH00108',
	'mathnavi-fa': 'BH00108',
	// 'Abdu'l-Bahá
	'alvah-i-vasaya-ar': 'AB00001',
	'alvah-i-vasaya-fa': 'AB00001',
	'madaniyyih-ar': 'AB00004',
	'madaniyyih-fa': 'AB00004',
	'tadhkiratu-l-vafa-en': 'AB00002',
	'tadhkiratu-l-vafa-fa': 'AB00002',
	'maqaliy-i-sayyah-fa': 'AB00003',
	'lawh-i-hizar-bayti-fa': 'AB00005',
	'tafsir-i-kuntu-kanzan-makhfiyya-fa': 'AB00006',
	'sharh-i-shuhaday-i-yazd-va-isfahan-fa': 'AB00010',
	'tafsir-i-bismi-llahi-r-rahmani-r-rahim-ar': 'AB00013',
	'lawh-i-lahih-ar': 'AB00016',
	'lawh-i-aflakiyyih-ar': 'AB00029',
	'lawh-i-muhabbat-ar': 'AB00040',
	'lawh-i-haft-sham-ar': 'AB00052',
	'lawh-i-haft-sham-fa': 'AB00052',
	'lawh-i-tarbiyat-fa': 'AB00032',
	'lawh-i-ayat-ar': 'AB00062',
	'mufavadat-en': 'AB00067',
	// The Bab
	'kitabur-ruh-book-of-spirit-ar': 'BB00009',
	'sahifiy-i-baynil-haramayn-epistle-between-the-two-shrines-ar': 'BB00019',
	'commentary-on-the-surih-of-kawthar-ar': 'BB00007',
	'commentary-on-the-surih-of-val-asr-ar': 'BB00010',
	'sahifiy-i-makhzumiyyih-ar': 'BB00018',
	'sahify-i-jafariyyih-ar': 'BB00012',
	'sahifiy-i-radaviyyih-ar': 'BB00137',
	'tafsir-i-nubuvvat-i-khassih-commentary-on-muhammads-specific-mission-ar': 'BB00014',
	'risaliy-i-dhahabiyyih-golden-epistle-ar': 'BB00036',
	'risaliy-i-adliyyih-epistle-of-justice-fa': 'BB00017',
	'lawh-i-hurufat-tablet-of-the-letters-fa': 'BB00005',
	'khasail-i-sabih-seven-qualifications-ar': 'BB00562',
	'suriy-i-tawhid-commentary-of-the-surih-of-monotheism-ar': 'BB00075',
};

/** Parse Phelps file into structured entries */
function parsePhelps() {
	const raw = fs.readFileSync(PHELPS, 'utf-8');

	// Find all entry starts
	const entryRe = /\*\*([A-Z]{2,3}\d{5})\.\*\*\s+/g;
	const positions = [];
	let m;
	while ((m = entryRe.exec(raw)) !== null) {
		positions.push({ id: m[1], start: m.index, textStart: m.index + m[0].length });
	}

	const entries = new Map();
	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i];
		const end = i + 1 < positions.length ? positions[i + 1].start : raw.length;
		const text = raw.slice(pos.textStart, end).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

		const entry = { id: pos.id };

		// Title: text before "NNN words"
		const wcMatch = text.match(/^(.+?)\.\s*([\d,>]+)\s*words/);
		if (wcMatch) {
			const pre = wcMatch[1].trim();
			if (!/^[\d,>]/.test(pre)) {
				entry.title = pre.replace(/\s+/g, ' ');
				entry.titleNorm = norm(entry.title);
			}
			entry.word_count = parseInt(wcMatch[2].replace(/[,>]/g, ''), 10);
		}

		// Language
		const langMatch = text.match(/\d+\s*words,?\s*(Ara|Per|mixed|Eng|Trk)/i);
		if (langMatch) entry.lang = langMatch[1].toLowerCase();

		// Abstract (appears before Subjects)
		const absMatch = text.match(/Abstract:\s*(.+?)(?=\s*Subjects:)/);
		if (absMatch) entry.abstract = absMatch[1].trim();

		// Subjects (take the last Subjects: block in the entry)
		const subjIdx = text.lastIndexOf('Subjects: ');
		if (subjIdx !== -1) {
			const subjText = text.slice(subjIdx + 10).replace(/\.\s*$/, '');
			entry.subjects = subjText
				.split(/,\s*(?=[a-z])/)
				.map(s => s.trim().replace(/\.$/, ''))
				.filter(s => s.length > 2 && s.length < 200);
		}

		// Is this a best-known work? (has a named title in Phelps)
		entry.is_best_known = !!entry.title;

		entries.set(pos.id, entry);
	}

	return entries;
}

/** Build lookup maps for matching */
function buildLookup(entries) {
	const byNormTitle = new Map();
	const byTitleWords = new Map();

	for (const [id, entry] of entries) {
		if (entry.titleNorm) {
			byNormTitle.set(entry.titleNorm, id);

			// Also index by significant title words (first word of title before parenthetical)
			const mainTitle = norm(entry.title.replace(/\(.*?\)/, '').trim());
			if (mainTitle.length > 3) {
				byTitleWords.set(mainTitle, id);
			}
		}
	}

	return { byNormTitle, byTitleWords };
}

/** Try to match a catalog work to a Phelps entry */
function findMatch(work, lookup, entries) {
	const docId = work.doc_id;

	// 1. Manual override
	if (MANUAL_MATCHES[docId]) {
		return MANUAL_MATCHES[docId];
	}

	const workNorm = norm(work.title);
	if (!workNorm) return null;

	// 2. Exact normalized match
	if (lookup.byNormTitle.has(workNorm)) {
		return lookup.byNormTitle.get(workNorm);
	}

	// 3. Match the main title part (before parenthetical in our title)
	const mainPart = norm(work.title.replace(/\(.*?\)/, '').trim());
	if (mainPart.length > 5 && lookup.byTitleWords.has(mainPart)) {
		return lookup.byTitleWords.get(mainPart);
	}

	// 4. Substring match: does any Phelps title contain our work's main title?
	if (mainPart.length > 8) {
		for (const [id, entry] of entries) {
			if (entry.titleNorm && entry.titleNorm.includes(mainPart)) {
				return id;
			}
		}
	}

	// 5. Does our title contain any Phelps title?
	for (const [normTitle, id] of lookup.byNormTitle) {
		if (normTitle.length > 8 && workNorm.includes(normTitle)) {
			return id;
		}
	}

	// 6. Word overlap: >70% of words match
	const workWords = mainPart.split(' ').filter(w => w.length > 2);
	if (workWords.length >= 2) {
		let bestScore = 0;
		let bestId = null;
		for (const [id, entry] of entries) {
			if (!entry.titleNorm) continue;
			const phelpsWords = entry.titleNorm.split(' ').filter(w => w.length > 2);
			const overlap = workWords.filter(w => phelpsWords.includes(w)).length;
			const score = overlap / Math.max(workWords.length, phelpsWords.length);
			if (score > 0.6 && score > bestScore) {
				bestScore = score;
				bestId = id;
			}
		}
		if (bestId) return bestId;
	}

	return null;
}

/** Descriptions for scholarly works (not in Phelps) */
const SCHOLARLY_DESCRIPTIONS = {
	davudi: {
		author_bio: 'Dr. Ali-Murad Davudi (1922\u20131979) was a distinguished Iranian philosopher and professor at the University of Tehran. A Hand of the Cause appointee, he was kidnapped and presumed killed in November 1979 during the Iranian Revolution. His philosophical works bridge Islamic and Western philosophical traditions.',
		works: {
			'davudi-maqalat-falsafi-volume-1': 'A collection of philosophical essays examining foundational concepts in philosophy through the lens of Bah\u00e1\u2019\u00ed thought. Davudi brings his expertise in both Western and Islamic philosophy to bear on questions of epistemology, metaphysics, and ethics.',
			'davudi-maqalat-falsafi-volume-2': 'The second volume of philosophical essays continuing Davudi\u2019s exploration of philosophical questions, including discussions of consciousness, free will, and the relationship between science and religion.',
			'davudi-uluhiyyat': 'A systematic philosophical treatise on theology (divine science), examining proofs for the existence of God, divine attributes, and the relationship between the Creator and creation through both rational argumentation and scriptural evidence.',
			'davudi-mabahithi-dar-bariy-i-ruh': 'A philosophical investigation into the nature of the soul (r\u00fa\u1e25), drawing on Bah\u00e1\u2019\u00ed scriptures, Islamic philosophy, and Western philosophical traditions to examine consciousness, the afterlife, and spiritual development.',
			'davudi-insaniyyat': 'A philosophical study of humanity and human nature, examining what it means to be human from metaphysical, ethical, and spiritual perspectives. Davudi draws on the Bah\u00e1\u2019\u00ed writings to articulate a comprehensive philosophical anthropology.',
		},
	},
	mazindarani: {
		author_bio: 'M\u00edrz\u00e1 Asadu\u2019ll\u00e1h F\u00e1\u1e0dil M\u00e1zindar\u00e1n\u00ed (1881\u20131957) was a Hand of the Cause of God and the most prolific Bah\u00e1\u2019\u00ed historian and scholar of the 20th century. His multi-volume historical and theological works remain essential references for Bah\u00e1\u2019\u00ed studies.',
		works: {
			'mazindarani-tarikh-i-zuhuru-l-haqq-volume-': 'Part of M\u00e1zindar\u00e1n\u00ed\u2019s monumental nine-volume history of the B\u00e1b\u00ed and Bah\u00e1\u2019\u00ed religions, widely regarded as the most comprehensive and authoritative account in any language. Drawing on primary sources, eyewitness accounts, and official documents, this work traces the history of the Faith from its earliest origins through the ministry of Shoghi Effendi.',
			'mazindarani-asraru-l-athar-volume-': 'Part of M\u00e1zindar\u00e1n\u00ed\u2019s five-volume theological dictionary and encyclopedia of Bah\u00e1\u2019\u00ed terms, concepts, and historical references. Each entry traces the usage and meaning of significant terms across the Bah\u00e1\u2019\u00ed writings, providing essential context for understanding the sacred texts.',
		},
	},
	bushrui: {
		author_bio: '\u1E24asan Fu\u2019\u00e1d\u00ed Bushr\u00fa\u2019\u00ed was a distinguished Bah\u00e1\u2019\u00ed scholar known for his contributions to the study of the Bah\u00e1\u2019\u00ed writings.',
		works: {},
	},
	sulaymani: {
		author_bio: '\u2018Az\u00edzu\u2019ll\u00e1h Sulaym\u00e1n\u00ed Ardak\u00e1n\u00ed was a prolific Bah\u00e1\u2019\u00ed historian and author.',
		works: {
			'sulaymani-masabih-i-hidayat-volume-': 'Part of Sulaym\u00e1n\u00ed\u2019s multi-volume biographical encyclopedia documenting the lives and contributions of notable Bah\u00e1\u2019\u00eds. These volumes serve as essential reference works for the history of the Bah\u00e1\u2019\u00ed community.',
		},
	},
};

function main() {
	console.log('Parsing Phelps inventory...');
	const entries = parsePhelps();
	console.log(`  Found ${entries.size} entries`);

	const withAbstract = [...entries.values()].filter(e => e.abstract).length;
	const withTitle = [...entries.values()].filter(e => e.title).length;
	console.log(`  ${withTitle} with titles, ${withAbstract} with abstracts`);

	const lookup = buildLookup(entries);

	// Read all catalog works
	const authorDirs = fs.readdirSync(WORKS_DIR).filter(d =>
		fs.statSync(path.join(WORKS_DIR, d)).isDirectory()
	);

	let matched = 0;
	let unmatched = 0;
	let enriched = 0;

	for (const authorDir of authorDirs) {
		const dirPath = path.join(WORKS_DIR, authorDir);
		const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));

		for (const file of files) {
			const filePath = path.join(dirPath, file);
			const work = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

			// Skip scholarly works — handle separately
			if (work.category === 'scholarly') {
				const scholarlyInfo = SCHOLARLY_DESCRIPTIONS[authorDir];
				if (scholarlyInfo) {
					let desc = null;
					// Try exact match first, then prefix match for volume works
					if (scholarlyInfo.works[work.doc_id]) {
						desc = scholarlyInfo.works[work.doc_id];
					} else {
						// Prefix match for volume works
						for (const [prefix, d] of Object.entries(scholarlyInfo.works)) {
							if (work.doc_id.startsWith(prefix)) {
								desc = d;
								break;
							}
						}
					}
					if (desc) {
						work.description = desc;
						work.author_bio = scholarlyInfo.author_bio;
						if (!DRY_RUN) {
							fs.writeFileSync(filePath, JSON.stringify(work, null, 2) + '\n');
						}
						enriched++;
					}
				}
				continue;
			}

			// Sacred works — match to Phelps
			const phelpsId = findMatch(work, lookup, entries);
			if (phelpsId) {
				const entry = entries.get(phelpsId);
				matched++;

				let changed = false;
				if (entry.abstract && !work.description) {
					work.description = entry.abstract;
					changed = true;
				}
				if (entry.subjects && entry.subjects.length > 0 && !work.subjects) {
					// Take top 10 subjects
					work.subjects = entry.subjects.slice(0, 10);
					changed = true;
				}
				if (!work.phelps_id) {
					work.phelps_id = phelpsId;
					changed = true;
				}
				if (entry.is_best_known && !work.is_best_known) {
					work.is_best_known = true;
					changed = true;
				}

				if (changed) {
					enriched++;
					if (!DRY_RUN) {
						fs.writeFileSync(filePath, JSON.stringify(work, null, 2) + '\n');
					}
					if (entry.abstract) {
						console.log(`  ✓ ${work.doc_id} → ${phelpsId} (${entry.title || 'untitled'}) [abstract]`);
					} else {
						console.log(`  ✓ ${work.doc_id} → ${phelpsId} (${entry.title || 'untitled'}) [subjects only]`);
					}
				}
			} else {
				unmatched++;
				console.log(`  ✗ ${work.doc_id} — no match ("${work.title}")`);
			}
		}
	}

	console.log(`\nResults: ${matched} matched, ${unmatched} unmatched, ${enriched} enriched`);
	if (DRY_RUN) console.log('(dry run — no files written)');
}

main();
