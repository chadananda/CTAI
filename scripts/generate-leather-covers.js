#!/usr/bin/env node
/**
 * Generate leather book cover SVGs for proof-of-concept.
 * 8 covers: 2 per author, with unique central symbols.
 *
 * Usage: node scripts/generate-leather-covers.js
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('public/covers/works');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Author color palettes
const PALETTES = {
	bahaullah: { base: '#6b1a2a', dark: '#3d0f18', emboss: '#c9a84c', embossDark: '#8a6a28', embossLight: '#e0c570', spine: '#4d1220' },
	'the-bab': { base: '#1a4d3a', dark: '#0f2d22', emboss: '#8fbfa0', embossDark: '#5a8a6a', embossLight: '#b0d8be', spine: '#12382a' },
	'abdul-baha': { base: '#1a2744', dark: '#0f1628', emboss: '#8faac9', embossDark: '#5a7a9a', embossLight: '#b0c8e0', spine: '#131e36' },
	'shoghi-effendi': { base: '#e8e0d4', dark: '#c8bfb0', emboss: '#8a7e6e', embossDark: '#6a6050', embossLight: '#a89888', spine: '#d8d0c4' },
};

/** Common SVG filter definitions for leather texture + embossing */
function defs(p) {
	return `<defs>
    <filter id="leather" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" seed="42" result="noise"/>
      <feDiffuseLighting in="noise" lighting-color="${p.base}" surfaceScale="1.5" result="lit">
        <feDistantLight azimuth="225" elevation="50"/>
      </feDiffuseLighting>
      <feComposite in="lit" in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="3" seed="7"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="emboss-shadow">
      <feOffset dx="0.5" dy="0.5"/>
      <feGaussianBlur stdDeviation="0.3"/>
      <feFlood flood-color="${p.dark}" flood-opacity="0.4"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="emboss-highlight">
      <feOffset dx="-0.5" dy="-0.5"/>
      <feGaussianBlur stdDeviation="0.3"/>
      <feFlood flood-color="${p.embossLight}" flood-opacity="0.35"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>`;
}

/** Leather background with texture */
function background(p) {
	return `
    <rect width="200" height="280" rx="4" fill="${p.base}"/>
    <rect width="200" height="280" rx="4" filter="url(#leather)" opacity="0.6"/>
    <rect width="200" height="280" rx="4" filter="url(#grain)" opacity="0.08"/>`;
}

/** Spine detail */
function spine(p) {
	return `
    <rect x="0" y="0" width="14" height="280" fill="${p.spine}" rx="4"/>
    <rect x="12" y="0" width="3" height="280" fill="${p.dark}" opacity="0.3"/>
    <!-- Stitching -->
    ${Array.from({ length: 18 }, (_, i) =>
			`<line x1="7" y1="${15 + i * 15}" x2="7" y2="${20 + i * 15}" stroke="${p.emboss}" stroke-width="0.5" stroke-opacity="0.3" stroke-dasharray="1 2"/>`
		).join('\n    ')}`;
}

/** Decorative border frame with geometric pattern */
function border(p) {
	const c = p.emboss;
	return `
    <g opacity="0.5">
      <!-- Outer frame -->
      <rect x="22" y="14" width="168" height="252" rx="3" fill="none" stroke="${c}" stroke-width="0.8"/>
      <!-- Inner frame -->
      <rect x="28" y="20" width="156" height="240" rx="2" fill="none" stroke="${c}" stroke-width="0.4"/>
      <!-- Corner ornaments -->
      ${cornerOrnament(28, 20, c)}
      ${cornerOrnament(184, 20, c, true)}
      ${cornerOrnament(28, 260, c, false, true)}
      ${cornerOrnament(184, 260, c, true, true)}
    </g>`;
}

function cornerOrnament(x, y, color, flipX = false, flipY = false) {
	const sx = flipX ? -1 : 1;
	const sy = flipY ? -1 : 1;
	return `<g transform="translate(${x},${y}) scale(${sx},${sy})">
      <path d="M0,0 C8,0 12,4 12,12" fill="none" stroke="${color}" stroke-width="0.6"/>
      <path d="M0,4 C6,4 8,6 8,12" fill="none" stroke="${color}" stroke-width="0.4"/>
      <circle cx="3" cy="3" r="1.2" fill="${color}" opacity="0.4"/>
    </g>`;
}

/** Embossed shape — renders base + highlight + shadow for 3D effect */
function embossed(innerSvg, p) {
	return `
    <g filter="url(#emboss-shadow)">${innerSvg}</g>
    <g filter="url(#emboss-highlight)">${innerSvg}</g>
    <g>${innerSvg}</g>`;
}

/** Title text (original script, centered) */
function titleBlock(titleOriginal, p, y = 210) {
	const fontSize = titleOriginal.length > 20 ? 11 : titleOriginal.length > 12 ? 13 : 16;
	return `
    <text x="106" y="${y}" text-anchor="middle" font-family="'Scheherazade New','Traditional Arabic',serif"
          font-size="${fontSize}" fill="${p.emboss}" opacity="0.9" direction="rtl">${titleOriginal}</text>
    <text x="105.5" y="${y - 0.5}" text-anchor="middle" font-family="'Scheherazade New','Traditional Arabic',serif"
          font-size="${fontSize}" fill="${p.embossLight}" opacity="0.25" direction="rtl">${titleOriginal}</text>`;
}

/** Author line at bottom */
function authorLine(author, p) {
	const fontSize = author.length > 16 ? 7 : 8;
	return `
    <text x="106" y="250" text-anchor="middle" font-family="'Source Serif 4',Georgia,serif"
          font-size="${fontSize}" fill="${p.emboss}" opacity="0.5" letter-spacing="1">${author}</text>`;
}

// ============================================================
// Central symbols — unique per work
// ============================================================

/** Kitáb-i-Badí' — Nine-pointed star radiating light */
function symbolBadi(p) {
	const c = p.emboss;
	// 9-pointed star
	const points = [];
	for (let i = 0; i < 18; i++) {
		const angle = (i * 20 - 90) * Math.PI / 180;
		const r = i % 2 === 0 ? 32 : 14;
		points.push(`${106 + r * Math.cos(angle)},${120 + r * Math.sin(angle)}`);
	}
	const star = `<polygon points="${points.join(' ')}" fill="${c}" opacity="0.15" stroke="${c}" stroke-width="0.6"/>`;
	// Radiating lines
	const rays = Array.from({ length: 9 }, (_, i) => {
		const angle = (i * 40 - 90) * Math.PI / 180;
		const x2 = 106 + 44 * Math.cos(angle);
		const y2 = 120 + 44 * Math.sin(angle);
		return `<line x1="106" y1="120" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="0.4" opacity="0.3"/>`;
	}).join('');
	// Central light
	const center = `<circle cx="106" cy="120" r="6" fill="${c}" opacity="0.2"/>
    <circle cx="106" cy="120" r="3" fill="${c}" opacity="0.4"/>`;
	return embossed(`<g>${rays}${star}${center}</g>`, p);
}

/** Lawḥ-i-'Áshiq-va-Ma'shúq — Intertwined flame and crescent */
function symbolAshiq(p) {
	const c = p.emboss;
	// Crescent
	const crescent = `<path d="M86,130 A24,24 0 1,1 86,100 A18,18 0 1,0 86,130Z" fill="${c}" opacity="0.2" stroke="${c}" stroke-width="0.5"/>`;
	// Flame
	const flame = `<path d="M116,135 Q116,110 110,100 Q114,108 112,95 Q118,105 120,95 Q118,108 122,100 Q116,110 116,135Z"
      fill="${c}" opacity="0.25" stroke="${c}" stroke-width="0.5"/>`;
	// Unity circle
	const unity = `<circle cx="106" cy="115" r="38" fill="none" stroke="${c}" stroke-width="0.3" stroke-dasharray="2 3" opacity="0.3"/>`;
	return embossed(`<g>${unity}${crescent}${flame}</g>`, p);
}

/** Kitábu'r-Rúḥ — Ascending dove in geometric mandala */
function symbolRuh(p) {
	const c = p.emboss;
	// Mandala circles
	const mandala = [38, 30, 22, 14].map((r, i) =>
		`<circle cx="106" cy="120" r="${r}" fill="none" stroke="${c}" stroke-width="${0.3 + i * 0.1}" opacity="${0.15 + i * 0.08}"/>`
	).join('');
	// Geometric pattern within mandala
	const geo = Array.from({ length: 8 }, (_, i) => {
		const angle = (i * 45) * Math.PI / 180;
		return `<line x1="${106 + 14 * Math.cos(angle)}" y1="${120 + 14 * Math.sin(angle)}"
            x2="${106 + 38 * Math.cos(angle)}" y2="${120 + 38 * Math.sin(angle)}"
            stroke="${c}" stroke-width="0.3" opacity="0.2"/>`;
	}).join('');
	// Dove (simplified)
	const dove = `<g transform="translate(106,115)">
      <path d="M0,-10 C-4,-8 -8,-2 -16,2 C-10,0 -6,0 -3,2 C-4,4 -5,8 -3,10 C-1,6 0,4 0,2
               C0,4 1,6 3,10 C5,8 4,4 3,2 C6,0 10,0 16,2 C8,-2 4,-8 0,-10Z"
             fill="${c}" opacity="0.3" stroke="${c}" stroke-width="0.4"/>
    </g>`;
	return embossed(`<g>${mandala}${geo}${dove}</g>`, p);
}

/** Risáliy-i-Dhahabíyyih — Golden pen with calligraphic strokes */
function symbolDhahab(p) {
	const c = p.emboss;
	// Pen nib
	const pen = `<g transform="translate(106,120) rotate(-30)">
      <path d="M0,-30 L-3,-10 L0,10 L3,-10Z" fill="${c}" opacity="0.2" stroke="${c}" stroke-width="0.5"/>
      <line x1="0" y1="-10" x2="0" y2="8" stroke="${c}" stroke-width="0.3" opacity="0.4"/>
      <circle cx="0" cy="-30" r="2" fill="${c}" opacity="0.3"/>
    </g>`;
	// Radiating calligraphic strokes (deterministic)
	const strokes = Array.from({ length: 7 }, (_, i) => {
		const angle = (-60 + i * 20) * Math.PI / 180;
		const r = 30 + (i * 7) % 11;
		const x2 = 106 + r * Math.cos(angle);
		const y2 = 120 + r * Math.sin(angle);
		return `<path d="M106,120 Q${106 + 15 * Math.cos(angle + 0.3)},${120 + 15 * Math.sin(angle + 0.3)} ${x2},${y2}"
            fill="none" stroke="${c}" stroke-width="${0.3 + (i % 3) * 0.2}" opacity="0.2"/>`;
	}).join('');
	return embossed(`<g>${strokes}${pen}</g>`, p);
}

/** Alváḥ-i-Vaṣáyá — Covenant seal with shield */
function symbolVasaya(p) {
	const c = p.emboss;
	// Shield
	const shield = `<path d="M106,88 L132,100 L132,128 Q132,148 106,158 Q80,148 80,128 L80,100Z"
      fill="${c}" opacity="0.1" stroke="${c}" stroke-width="0.7"/>`;
	// Inner shield detail
	const inner = `<path d="M106,96 L124,105 L124,126 Q124,140 106,148 Q88,140 88,126 L88,105Z"
      fill="none" stroke="${c}" stroke-width="0.4" opacity="0.3"/>`;
	// Covenant seal — concentric rings
	const seal = `<circle cx="106" cy="120" r="16" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.4"/>
    <circle cx="106" cy="120" r="10" fill="none" stroke="${c}" stroke-width="0.3" opacity="0.3"/>
    <circle cx="106" cy="120" r="5" fill="${c}" opacity="0.15"/>`;
	// Star in center
	const star5 = [];
	for (let i = 0; i < 10; i++) {
		const angle = (i * 36 - 90) * Math.PI / 180;
		const r = i % 2 === 0 ? 5 : 2;
		star5.push(`${106 + r * Math.cos(angle)},${120 + r * Math.sin(angle)}`);
	}
	const starEl = `<polygon points="${star5.join(' ')}" fill="${c}" opacity="0.35"/>`;
	return embossed(`<g>${shield}${inner}${seal}${starEl}</g>`, p);
}

/** Madaníyyih — Rising sun over city silhouette */
function symbolMadaniyyih(p) {
	const c = p.emboss;
	// Sun
	const sun = `<circle cx="106" cy="108" r="16" fill="${c}" opacity="0.15" stroke="${c}" stroke-width="0.5"/>`;
	const rays = Array.from({ length: 12 }, (_, i) => {
		const angle = (i * 30 - 90) * Math.PI / 180;
		return `<line x1="${106 + 18 * Math.cos(angle)}" y1="${108 + 18 * Math.sin(angle)}"
            x2="${106 + 28 * Math.cos(angle)}" y2="${108 + 28 * Math.sin(angle)}"
            stroke="${c}" stroke-width="0.5" opacity="0.3"/>`;
	}).join('');
	// City silhouette
	const city = `<path d="M60,145 L60,135 L65,135 L65,130 L70,130 L70,138 L78,138 L78,125 L82,120 L86,125 L86,138
      L92,138 L92,128 L96,128 L96,138 L100,138 L100,122 L104,118 L108,122 L108,138
      L114,138 L114,130 L118,130 L118,138 L124,138 L124,132 L128,128 L132,132 L132,138
      L138,138 L138,134 L142,134 L142,138 L148,138 L148,145Z"
      fill="${c}" opacity="0.2" stroke="${c}" stroke-width="0.4"/>`;
	// Horizon line
	const horizon = `<line x1="50" y1="145" x2="162" y2="145" stroke="${c}" stroke-width="0.5" opacity="0.3"/>`;
	return embossed(`<g>${rays}${sun}${city}${horizon}</g>`, p);
}

/** Lawh-i-Qarn — Century rosette with "100" */
function symbolQarn(p) {
	const c = p.emboss;
	// Rosette petals
	const petals = Array.from({ length: 12 }, (_, i) => {
		const angle = (i * 30) * Math.PI / 180;
		const cx = 106 + 24 * Math.cos(angle);
		const cy = 120 + 24 * Math.sin(angle);
		return `<ellipse cx="${cx}" cy="${cy}" rx="8" ry="4"
            transform="rotate(${i * 30},${cx},${cy})"
            fill="${c}" opacity="0.08" stroke="${c}" stroke-width="0.3"/>`;
	}).join('');
	// Outer ring
	const ring = `<circle cx="106" cy="120" r="36" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.25"/>`;
	// Inner ring
	const inner = `<circle cx="106" cy="120" r="16" fill="${c}" opacity="0.06" stroke="${c}" stroke-width="0.4"/>`;
	// "100" text
	const text = `<text x="106" y="124" text-anchor="middle" font-family="'Source Serif 4',Georgia,serif"
      font-size="14" fill="${c}" opacity="0.4" letter-spacing="1">100</text>`;
	return embossed(`<g>${petals}${ring}${inner}${text}</g>`, p);
}

/** Ridván 105 — Garden gate with pomegranate */
function symbolRidvan(p) {
	const c = p.emboss;
	// Garden arch/gate
	const gate = `<path d="M78,150 L78,110 A28,28 0 0,1 134,110 L134,150" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.35"/>
    <path d="M84,150 L84,114 A22,22 0 0,1 128,114 L128,150" fill="none" stroke="${c}" stroke-width="0.4" opacity="0.25"/>`;
	// Gate bars
	const bars = `<line x1="96" y1="115" x2="96" y2="150" stroke="${c}" stroke-width="0.3" opacity="0.2"/>
    <line x1="106" y1="110" x2="106" y2="150" stroke="${c}" stroke-width="0.3" opacity="0.2"/>
    <line x1="116" y1="115" x2="116" y2="150" stroke="${c}" stroke-width="0.3" opacity="0.2"/>`;
	// Pomegranate at apex
	const pomegranate = `<circle cx="106" cy="96" r="8" fill="${c}" opacity="0.15" stroke="${c}" stroke-width="0.5"/>
    <path d="M102,90 L106,86 L110,90" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.3"/>
    <line x1="106" y1="96" x2="106" y2="92" stroke="${c}" stroke-width="0.3" opacity="0.3"/>
    <line x1="103" y1="95" x2="106" y2="92" stroke="${c}" stroke-width="0.2" opacity="0.2"/>
    <line x1="109" y1="95" x2="106" y2="92" stroke="${c}" stroke-width="0.2" opacity="0.2"/>`;
	// Leaf/vine details
	const vines = `<path d="M78,130 C72,125 68,118 72,110" fill="none" stroke="${c}" stroke-width="0.3" opacity="0.2"/>
    <path d="M134,130 C140,125 144,118 140,110" fill="none" stroke="${c}" stroke-width="0.3" opacity="0.2"/>`;
	return embossed(`<g>${gate}${bars}${pomegranate}${vines}</g>`, p);
}

// ============================================================
// Manifest: 8 covers
// ============================================================
const COVERS = [
	{
		docId: 'kitab-i-badi-fa',
		author: 'bahaullah',
		authorDisplay: "Bah\u00e1\u2019u\u2019ll\u00e1h",
		titleOriginal: '\u0643\u062A\u0627\u0628 \u0628\u062F\u064A\u0639',
		symbol: symbolBadi,
	},
	{
		docId: 'lawh-i-ashiq-va-mashuq-ar',
		author: 'bahaullah',
		authorDisplay: "Bah\u00e1\u2019u\u2019ll\u00e1h",
		titleOriginal: '\u0644\u0648\u062D \u0627\u0644\u0639\u0627\u0634\u0642 \u0648\u0627\u0644\u0645\u0639\u0634\u0648\u0642',
		symbol: symbolAshiq,
	},
	{
		docId: 'kitabur-ruh-book-of-spirit-ar',
		author: 'the-bab',
		authorDisplay: 'The B\u00e1b',
		titleOriginal: '\u06A9\u062A\u0627\u0628 \u0631\u0648\u062D',
		symbol: symbolRuh,
	},
	{
		docId: 'risaliy-i-dhahabiyyih-golden-epistle-ar',
		author: 'the-bab',
		authorDisplay: 'The B\u00e1b',
		titleOriginal: '\u0631\u0633\u0627\u0644\u0647 \u0630\u0647\u0628\u064A\u0647',
		symbol: symbolDhahab,
	},
	{
		docId: 'alvah-i-vasaya-ar',
		author: 'abdul-baha',
		authorDisplay: "\u2018Abdu\u2019l-Bah\u00e1",
		titleOriginal: '\u0627\u0644\u0648\u0627\u062D \u0627\u0644\u0648\u0635\u0627\u064A\u0627',
		symbol: symbolVasaya,
	},
	{
		docId: 'madaniyyih-fa',
		author: 'abdul-baha',
		authorDisplay: "\u2018Abdu\u2019l-Bah\u00e1",
		titleOriginal: '\u0631\u0633\u0627\u0644\u0647 \u0645\u062F\u0646\u06CC\u0647',
		symbol: symbolMadaniyyih,
	},
	{
		docId: 'tawqi-i-mubarik-naw-ruz-101-be-lawh-i-qarn-ar',
		author: 'shoghi-effendi',
		authorDisplay: 'Shoghi Effendi',
		titleOriginal: '\u062A\u0648\u0642\u064A\u0639 \u0645\u0628\u0627\u0631\u0643 \u0646\u0648\u0631\u0648\u0632 \u0661\u0660\u0661 \u0628\u062F\u064A\u0639',
		symbol: symbolQarn,
	},
	{
		docId: 'tawqi-i-mubarik-ridvan-105-be-fa',
		author: 'shoghi-effendi',
		authorDisplay: 'Shoghi Effendi',
		titleOriginal: '\u062A\u0648\u0642\u06CC\u0639 \u0645\u0628\u0627\u0631\u06A9 \u0631\u0636\u0648\u0627\u0646 \u0661\u0660\u0665 \u0628\u062F\u06CC\u0639',
		symbol: symbolRidvan,
	},
];

function generateSVG(cover) {
	const p = PALETTES[cover.author];

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="200" height="280">
  ${defs(p)}
  ${background(p)}
  ${spine(p)}
  ${border(p)}
  ${cover.symbol(p)}
  ${titleBlock(cover.titleOriginal, p)}
  ${authorLine(cover.authorDisplay, p)}
</svg>`;
}

let count = 0;
for (const cover of COVERS) {
	const svg = generateSVG(cover);
	const outPath = path.join(OUT_DIR, `${cover.docId}.svg`);
	fs.writeFileSync(outPath, svg);
	console.log(`  \u2713 ${cover.docId}.svg`);
	count++;
}

console.log(`\nGenerated ${count} cover SVGs in ${OUT_DIR}`);
