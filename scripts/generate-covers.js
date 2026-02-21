#!/usr/bin/env node
// Generate book cover images using Gemini (generateContent API) + rembg
// Reads all work JSONs, auto-generates cover designs from metadata
// Usage: node scripts/generate-covers.js [slug] [--skip-existing] [--dry-run] [--model=gemini-2.5-flash-preview-image-generation]
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import sharp from 'sharp';

const CWD = process.cwd();
const COVERS_DIR = join(CWD, 'covers');
const WORKS_DIR = join(CWD, 'src/content/works');

mkdirSync(COVERS_DIR, { recursive: true });

const envContent = readFileSync(resolve(CWD, '.env'), 'utf-8');
const apiKey = envContent.match(/GEMINI_API_KEY="([^"]+)"/)?.[1]
  || envContent.match(/GEMINI_API_KEY=([^\s]+)/)?.[1];
if (!apiKey) { console.error('ERROR: GEMINI_API_KEY not found in .env'); process.exit(1); }

// rembg no longer needed — dark-background covers don't need background removal

// ── Author palettes ──
const AUTHOR_PALETTES = {
  bahaullah:       { leather: 'deep maroon-crimson',         border: 'gold Persian geometric lattice',          metal: 'gold' },
  'the-bab':       { leather: 'deep forest green',           border: 'silver-green mandalas and arabesques',    metal: 'silver' },
  'abdul-baha':    { leather: 'midnight navy blue',          border: 'silver-blue arabesques and vine scrolls', metal: 'silver' },
  'shoghi-effendi':{ leather: 'elegant ivory cream',         border: 'warm gray laurel wreaths and rosettes',   metal: 'gold' },
  mazindarani:     { leather: 'rich walnut brown',           border: 'copper arabesques and scrollwork',        metal: 'copper' },
  davudi:          { leather: 'dark espresso brown',         border: 'bronze geometric patterns',               metal: 'bronze' },
  sulaymani:       { leather: 'deep burgundy-brown',         border: 'amber scrollwork and vine motifs',        metal: 'amber-gold' },
  bushrui:         { leather: 'dark mahogany',               border: 'gold filigree and calligraphic borders',  metal: 'gold' },
};

// ── Visual motif vocabulary ──
const MOTIFS = {
  mystical: [
    'an ascending dove trailing streams of divine light',
    'a sacred flame rising from an ornate brazier, transforming into light',
    'a golden chalice overflowing with luminous water',
    'a nightingale perched on a blossoming rose branch',
    'a radiant burning bush with golden-white fire',
    'a mystical lamp casting concentric rings of light outward',
  ],
  architectural: [
    'an ornate mihrab prayer niche with radiating golden arches',
    'a grand dome with concentric geometric patterns, seen from below',
    'a terraced garden ascending a hillside with cypress trees',
    'an ornate Persian garden gate standing open to reveal paradise',
    'a minaret reaching toward a starlit sky',
    'a classical colonnade with light streaming between pillars',
  ],
  geometric: [
    'a nine-pointed star radiating brilliant golden light',
    'an elaborate Islamic geometric mandala with interlocking circles and hexagons',
    'concentric arabesque scrollwork expanding outward in golden filigree',
    'a radiant rosette medallion with intricate petal patterns',
    'interlocking pentagons and stars forming an infinite pattern',
    'a compass rose surrounded by geometric star patterns',
  ],
  celestial: [
    'a radiant sun with concentric rings of divine fire',
    'a luminous crescent moon cradling a single brilliant star',
    'seven celestial orbs arranged in an arc against a starfield',
    'a cosmic tree with branches reaching into a canopy of stars',
    'a radiant orb of light parting layers of clouds',
    'a constellation forming a sacred pattern against deep blue',
  ],
  natural: [
    'a cypress tree with golden-tipped branches against a luminous sky',
    'a pomegranate split open revealing jewel-like ruby seeds',
    'a Persian rose garden with flowing water channels',
    'a mountain peak piercing clouds with golden light above',
    'flowing water cascading over ancient stones into a reflective pool',
    'a vine heavy with grapes, leaves detailed in emerald and gold',
  ],
  scriptural: [
    'an open ancient book whose pages glow with sacred light',
    'a sacred flame atop an ornate lamp of knowledge',
    'an ornate golden pen nib with calligraphic strokes flowing from it',
    'a sealed scroll with a magnificent crimson wax seal',
    'a golden tablet inscribed with geometric patterns of text',
    'a quill pen crossed with a sword of light',
  ],
};

// ── Subject-to-motif mapping ──
const SUBJECT_MOTIF_MAP = {
  'prayer':           'mystical',
  'meditation':       'mystical',
  'devotion':         'mystical',
  'mystical':         'mystical',
  'love':             'mystical',
  'spiritual path':   'mystical',
  'sacrifice':        'mystical',
  'suffering':        'mystical',
  'martyrdom':        'mystical',
  'fire':             'mystical',
  'pilgrimage':       'architectural',
  'temple':           'architectural',
  'shrine':           'architectural',
  'garden':           'architectural',
  'civilization':     'architectural',
  'administrative':   'architectural',
  'institution':      'architectural',
  'covenant':         'scriptural',
  'unity':            'geometric',
  'oneness':          'geometric',
  'geometry':         'geometric',
  'creation':         'celestial',
  'cosmology':        'celestial',
  'heaven':           'celestial',
  'celestial':        'celestial',
  'star':             'celestial',
  'sun':              'celestial',
  'moon':             'celestial',
  'sovereignty':      'celestial',
  'power':            'celestial',
  'nature':           'natural',
  'rose':             'natural',
  'tree':             'natural',
  'water':            'natural',
  'mountain':         'natural',
  'word of god':      'scriptural',
  'scripture':        'scriptural',
  'book':             'scriptural',
  'knowledge':        'scriptural',
  'revelation':       'scriptural',
  'proofs':           'scriptural',
  'teaching':         'scriptural',
  'history':          'scriptural',
  'biography':        'scriptural',
  'transcendence':    'celestial',
  'unknowability':    'celestial',
  'divine emanation': 'celestial',
  'justice':          'geometric',
  'forgiveness':      'mystical',
  'mercy':            'mystical',
  'grace':            'mystical',
  'bounty':           'mystical',
  'chastisement':     'scriptural',
  'opposition':       'scriptural',
  'rejection':        'scriptural',
  'station':          'celestial',
  'manifestation':    'celestial',
  'transformation':   'mystical',
  'steadfastness':    'geometric',
  'protection':       'geometric',
  'defending':        'geometric',
};

// ── Hand-crafted overrides (only covers confirmed acceptable) ──
const MANUAL_DESIGNS = {
  'kitabur-ruh-book-of-spirit': {
    leather: 'deep forest green with emerald undertones',
    border: 'ascending dove silhouettes and geometric mandalas in silver-green',
    scene: 'a radiant white dove ascending through concentric circles of an elaborate geometric mandala, wings spread wide, trailing streams of divine light. The mandala pattern is intricate Islamic geometry — hexagons, stars, and interlocking circles in silver and pale green. Below the dove, clouds part to reveal a luminous horizon. Transcendence, the Holy Spirit ascending, divine emanation'
  },
};

// ── Load all works from JSON files + corpus _meta.json ──
const CORPUS_DIR = join(CWD, 'src/content/corpus');

function loadAllWorks() {
  const works = [];

  // Load 144 works from src/content/works/{author}/*.json
  const authors = readdirSync(WORKS_DIR).filter(d => {
    try { return readdirSync(join(WORKS_DIR, d)).length > 0; } catch { return false; }
  });
  for (const author of authors) {
    const authorDir = join(WORKS_DIR, author);
    const files = readdirSync(authorDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(authorDir, file), 'utf-8'));
      data._file = join(authorDir, file);
      works.push(data);
    }
  }

  // Load 11 SE corpus works from src/content/corpus/{slug}/_meta.json
  if (existsSync(CORPUS_DIR)) {
    for (const slug of readdirSync(CORPUS_DIR)) {
      const metaPath = join(CORPUS_DIR, slug, '_meta.json');
      if (!existsSync(metaPath)) continue;
      const raw = readFileSync(metaPath, 'utf-8');
      // _meta.json can be very large; only parse title/author
      const title = raw.match(/"title"\s*:\s*"([^"]+)"/)?.[1];
      const author = raw.match(/"author"\s*:\s*"([^"]+)"/)?.[1];
      if (!title || !author) continue;
      const authorSlug = author.includes('Bahá') ? 'bahaullah' : author.includes('Abdu') ? 'abdul-baha' : 'bahaullah';
      works.push({
        doc_id: slug,
        title,
        author,
        author_slug: authorSlug,
        description: '',
        subjects: [],
        category: 'sacred',
        _file: null, // corpus meta is read-only
        _corpus: true,
      });
    }
  }

  return works;
}

// ── Deterministic hash for consistent motif selection ──
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ── Auto-generate cover design from work metadata ──
function generateDesign(work) {
  const slug = work.doc_id;

  // Check for manual override (match by slug without language suffix)
  const baseSlug = slug.replace(/-(?:ar|fa)$/, '');
  if (MANUAL_DESIGNS[baseSlug]) {
    return MANUAL_DESIGNS[baseSlug];
  }

  const palette = AUTHOR_PALETTES[work.author_slug] || AUTHOR_PALETTES.mazindarani;

  // Analyze subjects to pick motif categories
  const subjects = work.subjects || (work.subject ? [work.subject] : []);
  const subjectText = subjects.join(' ').toLowerCase() + ' ' + (work.description || '').toLowerCase();

  // Score each motif category
  const scores = {};
  for (const [keyword, category] of Object.entries(SUBJECT_MOTIF_MAP)) {
    if (subjectText.includes(keyword)) {
      scores[category] = (scores[category] || 0) + 1;
    }
  }

  // Pick top 2 motif categories (or defaults)
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[0] || 'geometric';
  const secondary = ranked[1]?.[0] || (primary === 'geometric' ? 'scriptural' : 'geometric');

  // Use hash for deterministic selection within categories
  const hash = simpleHash(slug);
  const primaryMotifs = MOTIFS[primary];
  const secondaryMotifs = MOTIFS[secondary];
  const scene1 = primaryMotifs[hash % primaryMotifs.length];
  const scene2 = secondaryMotifs[(hash >> 4) % secondaryMotifs.length];

  // Add leather variation per work
  const leatherVariants = [
    'with aged patina', 'with subtle grain', 'with warm undertones',
    'with rich depth', 'with burnished edges', 'with antique finish',
  ];
  const leatherVar = leatherVariants[hash % leatherVariants.length];

  // Add border variation
  const borderExtras = [
    'and corner rosettes', 'and vine flourishes', 'and star medallions',
    'and interlocking knots', 'and leaf scrollwork', 'and crescent accents',
  ];
  const borderExtra = borderExtras[(hash >> 2) % borderExtras.length];

  // Build mood from description
  const moods = [];
  if (subjectText.includes('prayer') || subjectText.includes('meditation')) moods.push('devotional, contemplative');
  if (subjectText.includes('justice') || subjectText.includes('sovereignty')) moods.push('majestic, authoritative');
  if (subjectText.includes('love') || subjectText.includes('mystic')) moods.push('mystical, ecstatic');
  if (subjectText.includes('history') || subjectText.includes('biography')) moods.push('scholarly, dignified');
  if (subjectText.includes('suffering') || subjectText.includes('martyrdom')) moods.push('solemn, luminous');
  if (subjectText.includes('teaching') || subjectText.includes('civilization')) moods.push('radiant, hopeful');
  if (moods.length === 0) moods.push('sacred, luminous');

  return {
    leather: `${palette.leather} ${leatherVar}`,
    border: `${palette.border} ${borderExtra}`,
    scene: `${scene1}. Below this, ${scene2}. ${moods.join(', ')}`,
  };
}

function buildPrompt(title, author, design) {
  return `Front cover of an antique hand-crafted leather-bound book, filling the ENTIRE image edge to edge — no margins, no background visible, just the book cover itself occupying 100% of the frame. Shot straight on from directly above. The leather is rich aged ${design.leather} with visible grain, wear marks, and patina. Dark, moody lighting with warm highlights that emphasize depth and texture.

The cover features a deeply embossed and tooled illustration occupying the central area — raised leather relief with hand-painted color details in rich jewel tones (deep ruby, emerald, gold leaf, sapphire) worked into the tooled leather. The embossed art is dramatic, three-dimensional, and richly colored against the dark leather. Ornate gold-leaf border with ${design.border} frames the illustration.

At the TOP of the cover, centered horizontally, the title "${title}" is embossed in elegant gold-leaf serif lettering — the letters are raised and catch warm light. The title text must be EXACTLY "${title}" — spelled precisely with all diacritical marks.

At the BOTTOM of the cover, centered horizontally, the author name "${author}" is embossed in gold-leaf serif lettering, slightly smaller than the title. The author text must be EXACTLY "${author}".

The embossed center illustration (between title and author) shows ${design.scene}.

Hyper-detailed macro photography quality. The embossed illustration should be the focal point — richly colored with deep saturated jewel tones, detailed, with strong dimensional depth from the tooled leather relief. The overall feel is dark, luxurious, and ancient — like a precious artifact photographed in dramatic museum lighting. No modern elements, no digital artifacts. No human faces or figures of any kind.`;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateCover(work, model, dryRun) {
  const slug = work.doc_id;
  const design = generateDesign(work);
  const title = work.title;
  const author = work.author;

  const outfile = join(COVERS_DIR, `${slug}.png`);

  if (skipExisting && existsSync(outfile)) {
    console.log(`  SKIP: ${slug} (already exists)`);
    // Still save design description if missing
    if (!work.cover_description && work._file) {
      work.cover_description = `Leather: ${design.leather}. Border: ${design.border}. Scene: ${design.scene}`;
      const { _file, _corpus, ...cleanWork } = work;
      writeFileSync(_file, JSON.stringify(cleanWork, null, 2) + '\n');
    }
    return true;
  }

  console.log(`\n  [${slug}]`);
  console.log(`  Title: "${title}" by ${author}`);
  console.log(`  Leather: ${design.leather}`);
  console.log(`  Scene: ${design.scene.slice(0, 120)}...`);

  // Save cover_description to the work JSON (skip corpus entries)
  if (work._file) {
    const coverDesc = `Leather: ${design.leather}. Border: ${design.border}. Scene: ${design.scene}`;
    if (work.cover_description !== coverDesc) {
      work.cover_description = coverDesc;
      const { _file, _corpus, ...cleanWork } = work;
      writeFileSync(_file, JSON.stringify(cleanWork, null, 2) + '\n');
      console.log(`  ✓ Saved cover_description to JSON`);
    }
  }

  if (dryRun) {
    console.log(`  DRY RUN: would generate cover`);
    return true;
  }

  const prompt = buildPrompt(title, author, design);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '3:4' }
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ✗ API error (${response.status}):`, errorText.slice(0, 500));
      return false;
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (imagePart) {
      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      writeFileSync(outfile, buffer);
      const meta = await sharp(buffer).metadata();
      console.log(`  ✓ Saved: ${meta.width}x${meta.height} (${(buffer.length / 1024).toFixed(0)}KB)`);

      const textPart = parts.find(p => p.text);
      if (textPart) console.log(`  Model: ${textPart.text.slice(0, 100)}`);

      // Update cover_image in work JSON (skip corpus entries)
      if (work._file) {
        const { _file: filePath, _corpus, ...clean } = work;
        clean.cover_image = `/covers/works/${slug}.png`;
        writeFileSync(filePath, JSON.stringify(clean, null, 2) + '\n');
        console.log(`  ✓ Updated cover_image in JSON`);
      }

      return true;
    }

    const textPart = parts.find(p => p.text);
    if (textPart) console.log(`  ✗ Text only: ${textPart.text.slice(0, 300)}`);
    else console.log(`  ✗ No image generated. Response:`, JSON.stringify(data).slice(0, 500));
    return false;
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return false;
  }
}

// ── CLI ──
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const skipExisting = process.argv.includes('--skip-existing');
const dryRun = process.argv.includes('--dry-run');
const modelFlag = process.argv.find(a => a.startsWith('--model='));
const MODEL = modelFlag ? modelFlag.split('=')[1] : 'gemini-3-pro-image-preview';
const target = args[0];

async function main() {
  console.log(`Book cover generation (${MODEL} + rembg)`);
  console.log(`Options: skip-existing=${skipExisting}, dry-run=${dryRun}\n`);

  const works = loadAllWorks();
  console.log(`Loaded ${works.length} works\n`);

  if (target) {
    const work = works.find(w => w.doc_id === target);
    if (!work) { console.error(`Work not found: ${target}`); process.exit(1); }
    await generateCover(work, MODEL, dryRun);
  } else {
    // Sort by author for visual grouping in output
    works.sort((a, b) => a.author_slug.localeCompare(b.author_slug) || a.doc_id.localeCompare(b.doc_id));
    let success = 0, fail = 0, skip = 0;
    for (let i = 0; i < works.length; i++) {
      const ok = await generateCover(works[i], MODEL, dryRun);
      if (ok) success++; else fail++;
      if (!dryRun && i < works.length - 1) {
        console.log('  ⏳ Waiting 5s...');
        await delay(5000);
      }
    }
    console.log(`\n  Done: ${success} generated, ${fail} failed out of ${works.length} works`);
  }
}

main();
