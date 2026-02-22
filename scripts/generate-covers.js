#!/usr/bin/env node
// Generate book cover images using Gemini (generateContent API)
// Reads all work JSONs, auto-generates cover designs from metadata
// Usage: node scripts/generate-covers.js [slug] [--skip-existing] [--dry-run] [--model=...]
//        node scripts/generate-covers.js --quran [--skip-existing] [--dry-run]
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

// ── Green-screen post-processing pipeline ──
// All covers are generated on a green (#00FF00) background, then chroma-keyed
// to transparent. See docs/cover-generation.md for full rationale.
async function chromaKeyAndTrim(buffer) {
  const { data: px, info } = await sharp(buffer)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const out = Buffer.from(px);

  // Sample background color from corners
  const sz = 15;
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = 0; y < sz; y++)
    for (let x = 0; x < sz; x++)
      for (const [ox, oy] of [[0,0],[w-sz,0],[0,h-sz],[w-sz,h-sz]]) {
        const gi = ((y + oy) * w + (x + ox)) * 4;
        sr += px[gi]; sg += px[gi+1]; sb += px[gi+2]; n++;
      }
  const bgR = sr/n, bgG = sg/n, bgB = sb/n;

  // Flood-fill from corners: remove connected background pixels (including shadows)
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h * 2);
  const tolerance = 120;

  for (const [sx, sy] of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]]) {
    let qHead = 0, qTail = 0;
    const sk = sy * w + sx;
    if (visited[sk]) continue;
    queue[qTail++] = sx; queue[qTail++] = sy;
    visited[sk] = 1;

    while (qHead < qTail) {
      const cx = queue[qHead++], cy = queue[qHead++];
      const gi = (cy * w + cx) * 4;
      const r = out[gi], g = out[gi+1], b = out[gi+2];
      const dr = r - bgR, dg = g - bgG, db = b - bgB;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);

      if (dist > tolerance) continue;

      out[gi + 3] = 0;

      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nk = ny * w + nx;
        if (visited[nk]) continue;
        visited[nk] = 1;
        queue[qTail++] = nx; queue[qTail++] = ny;
      }
    }
  }

  // Despill: remove magenta tint from edge pixels adjacent to transparency
  for (let i = 0; i < w * h; i++) {
    if (out[i * 4 + 3] === 0) continue;
    const x = i % w, y = (i - x) / w;
    let nearEdge = false;
    for (const [dx, dy] of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,1],[-1,1],[1,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (out[(ny * w + nx) * 4 + 3] === 0) { nearEdge = true; break; }
    }
    if (nearEdge) {
      const gi = i * 4;
      const r = out[gi], g = out[gi+1], b = out[gi+2];
      // Magenta spill: both R and B elevated relative to G
      const magenta = (r + b) / 2 - g;
      if (magenta > 30) {
        out[gi] = Math.min(r, g + 10);     // cap red
        out[gi + 2] = Math.min(b, g + 10); // cap blue
      }
    }
  }

  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png().toBuffer();
  const trimmed = await sharp(png).trim().toBuffer({ resolveWithObject: true });
  const pad = 12;
  return sharp(trimmed.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad,
              background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
}

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
  return `Front cover of an antique hand-crafted leather-bound book, photographed from directly above against a SOLID BRIGHT MAGENTA (#FF00FF) background. The book should NOT fill the entire frame — show the complete book with its natural edges, worn corners, and irregular leather boundaries visible against the green background. Leave a visible margin of green around all edges of the book.

The leather is rich aged ${design.leather} with visible grain, wear marks, and patina. Dark, moody lighting with warm highlights that emphasize depth and texture.

The cover features a deeply embossed and tooled illustration occupying the central area — raised leather relief with hand-painted color details in rich jewel tones (deep ruby, emerald, gold leaf, sapphire) worked into the tooled leather. The embossed art is dramatic, three-dimensional, and richly colored against the dark leather. Ornate gold-leaf border with ${design.border} frames the illustration.

At the TOP of the cover, centered horizontally, the title "${title}" is embossed in elegant gold-leaf serif lettering — the letters are raised and catch warm light. The title text must be EXACTLY "${title}" — spelled precisely with all diacritical marks.

At the BOTTOM of the cover, centered horizontally, the author name "${author}" is embossed in gold-leaf serif lettering, slightly smaller than the title. The author text must be EXACTLY "${author}".

The embossed center illustration (between title and author) shows ${design.scene}.

Hyper-detailed macro photography quality. The embossed illustration should be the focal point — richly colored with deep saturated jewel tones, detailed, with strong dimensional depth from the tooled leather relief. The overall feel is dark, luxurious, and ancient — like a precious artifact photographed in dramatic museum lighting. No modern elements, no digital artifacts. No human faces or figures of any kind.

CRITICAL: The background behind the book must be SOLID PURE MAGENTA (#FF00FF) with absolutely no variation, shadow, or gradient. The book's natural worn edges and corners should be clearly visible against this green.`;
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
      const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const buffer = await chromaKeyAndTrim(rawBuffer);
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Qurʼán sura covers ──
// ══════════════════════════════════════════════════════════════════════════════

const QURAN_PALETTE = {
  meccan: { leather: 'deep emerald green', metal: 'gold', borderStyle: 'interlocking star-and-hexagon geometric lattice with celestial rosettes' },
  medinan: { leather: 'deep emerald green', metal: 'silver', borderStyle: 'flowing arabesque vine scrolls with architectural arch motifs' },
};

// Per-sura unique motif mapped by sura index. Each motif is a visual description
// that respects Islamic aniconism (no human/animal figures — abstract geometric only).
const SURA_MOTIFS = {
  1:   'an ornate gate opening to reveal radiant streams of golden light — the threshold of divine guidance',
  2:   'a grand geometric medallion with agricultural motifs — wheat sheaves, flowing water channels, and concentric hexagonal patterns in gold and green',
  3:   'an ascending family tree rendered as interlocking geometric branches, each node a luminous star medallion',
  4:   'a protective geometric dome formed by overlapping crescent arches, sheltering a garden of stylized flowers',
  5:   'an ornate ceremonial table rendered as a geometric rosette with five-fold symmetry, radiating abundance',
  6:   'a hexagonal honeycomb pattern expanding outward, each cell containing a different geometric seed-of-life motif',
  7:   'terraced mountain ridges ascending in geometric layers, crowned with luminous star patterns at the summit',
  8:   'radiating spear-like geometric rays emanating from a central octagonal star — victory and divine aid',
  9:   'a broken chain transforming into flowing arabesque vines — repentance blossoming into renewal',
  10:  'a luminous geometric vessel of light sailing across vast tessellated ocean waves in gold and deep blue — divine guidance across the depths',
  11:  'concentric arches receding into infinite depth, each ring adorned with different geometric patterns — endurance',
  12:  'a radiant twelve-pointed star within a geometric well shaft, light ascending from the depths',
  13:  'jagged lightning-bolt geometric patterns radiating from thundercloud spirals in silver and electric blue',
  14:  'a great geometric tree with roots forming intricate knotwork below and branches reaching into starlight above',
  15:  'towering rock formations rendered as geometric crystalline columns with light refracting through faceted surfaces',
  16:  'an elaborate hexagonal honeycomb mandala with floral rosettes in each cell — geometric abstraction of divine provision',
  17:  'a sweeping arc of stars across a night sky with geometric cloud layers below — the celestial journey',
  18:  'a deep cavern entrance framed by stalactite-like geometric formations with light glowing from within',
  19:  'a luminous crescent cradling a radiant palm tree with dates rendered as golden geometric droplets',
  20:  'two intersecting geometric letters forming an elaborate knot pattern, surrounded by burning bush motifs',
  21:  'a procession of luminous geometric lanterns receding into the distance, each with unique filigree patterns',
  22:  'the Kaaba rendered as a perfect geometric cube surrounded by concentric circles of worshippers as abstract dots',
  23:  'ascending geometric stairs of light, each step adorned with a different arabesque pattern — the believers\' ascent',
  24:  'a radiant geometric star emanating concentric rings of light — the famous Light Verse rendered as pure geometry',
  25:  'a great balance scale rendered in geometric precision, light radiating from its fulcrum — the divine criterion',
  26:  'flowing calligraphic scrollwork arranged in geometric wave patterns — the power of inspired verse',
  27:  'an intricate radial mandala of tiny geometric cells arranged in precise mathematical spirals — abstract lattice',
  28:  'an unrolling geometric scroll revealing nested stories within stories, each frame a different pattern',
  29:  'an intricate radial web-like geometric mandala with concentric rings of increasing complexity and delicacy',
  30:  'classical columns and arches rendered in geometric precision with crescent moons adorning each keystone',
  31:  'a wise geometric tree with roots of knotwork and a canopy of overlapping medallion-leaf patterns',
  32:  'a figure-like mihrab niche at the center of concentric geometric prayer-mat patterns — devotion in form',
  33:  'interlocking shield-like geometric shapes forming an impenetrable wall pattern — unity of the clans',
  34:  'an ancient geometric cityscape with terraced gardens, fountains, and dam structures in precise linework',
  35:  'a cosmic spiral of geometric creation patterns, each arm seeded with different floral and stellar motifs',
  36:  'an elaborate monogram of the letters Ya-Sin in ornamental Kufic style surrounded by geometric mandalas',
  37:  'parallel rows of geometric lances arranged in perfect rank formation, tips touching a radiant sun above',
  38:  'the letter Sad rendered as an enormous ornamental calligraphic form surrounded by geometric rosettes and stars',
  39:  'flowing groups of geometric shapes converging toward a central radiant point — the gathering of souls',
  40:  'a great geometric lock being opened by a key of light — divine forgiveness rendered as sacred mechanism',
  41:  'concentric geometric frames, each layer revealing a more detailed and intricate pattern within — explained in detail',
  42:  'a circular council of geometric shapes arranged in deliberation, rays connecting each to a central light',
  43:  'ornate gold filigree patterns cascading across the cover like precious decorative metalwork — ornaments of gold',
  44:  'swirling geometric smoke patterns in silver-gray, penetrated by shafts of golden light from above',
  45:  'geometric figures in crouching postures rendered as abstract angular forms, arranged in concentric rings',
  46:  'undulating geometric sand dune patterns with wind-carved ripples rendered in gold and amber gradients',
  47:  'a radiant geometric sword crossed with an olive branch, both formed from interlocking arabesque patterns',
  48:  'a great geometric gate swinging open with triumphant radiance — victory rendered as architectural revelation',
  49:  'geometric room partitions forming an intricate floor plan mandala — the inner chambers of courtesy',
  50:  'the letter Qaf rendered as a monumental ornamental form with mountain motifs and earth patterns surrounding it',
  51:  'dynamic spiral geometric wind patterns carrying geometric seed forms — the winnowing rendered as sacred motion',
  52:  'a great geometric mountain peak crowned with fire motifs and celestial patterns at its summit',
  53:  'a radiant five-pointed star descending through geometric cloud layers — the celestial descent',
  54:  'a luminous crescent moon within an elaborate geometric mandala of concentric star patterns',
  55:  'cascading garden terraces with flowing geometric water channels and pomegranate-rosette trees — divine mercy',
  56:  'a cosmic geometric hourglass with stars flowing through its narrow center — the inevitable rendered as form',
  57:  'a great geometric anvil with radiating strength patterns — iron rendered as crystalline geometric lattice',
  58:  'two geometric forms in dialogue across a bridge of light — the plea rendered as sacred geometry',
  59:  'a geometric fortress dissolving into scattered star patterns — exile and divine reassignment',
  60:  'a geometric scale weighing heart-shaped medallions — examination rendered as sacred measurement',
  61:  'perfect geometric ranks of identical motifs arranged in military precision — unity in formation',
  62:  'a geometric minaret with radiating call-to-prayer waves and a central gathering circle below',
  63:  'a geometric mask pattern with cracks revealing light beneath — hypocrisy unveiled',
  64:  'two mirrored geometric patterns revealing their hidden differences — mutual disillusion as sacred mirror',
  65:  'a geometric knot being carefully untied, each strand becoming a flowing arabesque — separation with dignity',
  66:  'a geometric seal being placed on a sacred geometric vessel — prohibition as divine protection',
  67:  'a geometric crown and scepter formed from interlocking star patterns — divine sovereignty',
  68:  'a great ornamental pen nib with flowing calligraphic streams of geometric patterns — the divine pen',
  69:  'a geometric veil being drawn back to reveal a radiant geometric truth behind it — reality unveiled',
  70:  'ascending geometric stairways spiraling upward through celestial layers — the ascending stairways to the divine',
  71:  'a great geometric ark riding geometric waves beneath a canopy of stars — salvation through obedience',
  72:  'flickering geometric flame-forms arranged in a circle around a central sacred fire — the unseen world',
  73:  'a geometric figure wrapped in flowing arabesque robes of light — the enshrouded one in devotion',
  74:  'a geometric figure cloaked in layered geometric patterns radiating outward — the cloaked one arising',
  75:  'a cosmic geometric sunrise over a field of awakening geometric seed-forms — resurrection as renewal',
  76:  'a geometric chalice pouring forth streams that branch into garden patterns — divine sustenance to humanity',
  77:  'a procession of geometric wind-forms sweeping across the cover from right to left — divine emissaries',
  78:  'a great geometric trumpet-form with expanding concentric sound-rings — the announcement',
  79:  'dynamic geometric forms in sweeping curved arcs — those who draw forth rendered as cosmic motion',
  80:  'a geometric face-form turning away, then turning toward light — the moment of frowning then accepting',
  81:  'a cosmic geometric sphere being wrapped in darkness, then unwrapped to reveal stars — the overthrowing',
  82:  'a geometric dome cleaving open along precise fault lines to reveal light within — the splitting asunder',
  83:  'a tipping geometric balance with uneven loads — defrauding rendered as sacred asymmetry',
  84:  'a geometric sky splitting open along a luminous seam with radiance pouring through — the splitting open',
  85:  'twelve geometric constellation patterns arranged in a great zodiacal circle — the celestial mansions',
  86:  'a radiant geometric morning star with piercing rays cutting through layered geometric darkness',
  87:  'a soaring geometric ascent pattern reaching toward a radiant point above all other patterns — the Most High',
  88:  'a great geometric wave cresting over everything below — the overwhelming rendered as cosmic force',
  89:  'geometric rays of a breaking dawn splitting a dark geometric horizon — the sacred dawn',
  90:  'a geometric cityscape with winding paths between buildings leading to a central radiant square — the city',
  91:  'a radiant geometric sun with concentric arabesque rings expanding outward in gold and amber',
  92:  'a deep geometric nightscape with stars as geometric points and a single path of moonlight below',
  93:  'a gentle geometric sunrise with soft radiating bands of warm gold and amber — the morning hours',
  94:  'a geometric heart-form with expanding concentric rings of relief and comfort — the consolation',
  95:  'a geometric fig tree with ornate geometric framing, fruit rendered as golden geometric droplets',
  96:  'a geometric drop of crimson becoming a radiant human-like geometric form — creation from the clot',
  97:  'a single night sky dense with geometric stars, one radiant star-form brighter than all others — the Night of Power',
  98:  'a radiant geometric book opening to reveal undeniable patterns of truth — the clear evidence',
  99:  'concentric geometric earthquake ripples emanating from a central fissure of light — the great quaking',
  100: 'dynamic geometric hoofprint patterns arranged in charging-gallop formation — the chargers as abstract motion',
  101: 'a great geometric hammer-form striking an anvil with radiating shock-wave patterns — the calamity',
  102: 'geometric towers growing taller in competitive stacks until they topple — the rivalry of accumulation',
  103: 'a geometric hourglass with sand-grains as tiny stars flowing through — the declining day, time itself',
  104: 'a geometric tongue-form wrapped in thorns that transform into geometric flames — the slanderer consumed',
  105: 'a great geometric boulder formation with tiny geometric pebble-forms raining down — abstract divine intervention',
  106: 'a geometric caravan route connecting two geometric city medallions — the tribal journey of Quraysh',
  107: 'a geometric hand extending a geometric vessel of provision — almsgiving as sacred geometry',
  108: 'a geometric fountain overflowing with cascading rivulets forming arabesque patterns — divine abundance',
  109: 'two geometric worlds separated by an ornate geometric border — the clear separation of paths',
  110: 'a geometric victory arch with flowing crowds rendered as abstract dots streaming through — divine support',
  111: 'geometric palm fiber strands woven into a net pattern that disintegrates into ash — destruction of malice',
  112: 'a single perfect geometric form — a radiant orb of absolute unity, no divisions, no parts — pure sincerity',
  113: 'a geometric dawn breaking through a web of geometric darkness — seeking refuge in the daybreak',
  114: 'concentric geometric circles representing all humanity, with a protective geometric shield at the center — refuge in God',
};

// Leather and border variations for Qurʼán covers
const QURAN_LEATHER_VARIANTS = [
  'with aged patina and warm golden undertones',
  'with subtle grain and deep forest shadows',
  'with rich burnished edges catching amber light',
  'with antique finish and olive-gold undertones',
  'with deep jewel-tone depth and visible tooling marks',
  'with warm teal undertones and aged cracking',
];

const QURAN_BORDER_EXTRAS = [
  'corner rosettes with crescent accents',
  'star medallions at each corner',
  'interlocking knot patterns at the borders',
  'vine and leaf scrollwork framing',
  'layered arch motifs at top and bottom',
  'geometric cornerpieces with floral insets',
];

function suraSlug(tname) {
  return tname
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u02BB\u02BC\u2018\u2019\u2032\u0027]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function loadQuranSuras() {
  const dataPath = join(CWD, 'src/data/quran-suras.json');
  return JSON.parse(readFileSync(dataPath, 'utf-8'));
}

function buildQuranPrompt(sura, design) {
  return `Front cover of an antique hand-crafted leather-bound book, photographed from directly above against a SOLID BRIGHT MAGENTA (#FF00FF) background. The book should NOT fill the entire frame — show the complete book with its natural edges, worn corners, and irregular leather boundaries visible against the green background. Leave a visible margin of green around all edges of the book.

The leather is rich aged ${design.leather} with visible grain, wear marks, and patina. Dark, moody museum lighting.

The CENTRAL focal point is the Arabic calligraphy "${sura.name}" — large, ornamental, deeply embossed in gold leaf. The calligraphy is surrounded by ${design.motif} in raised leather relief with hand-painted jewel tones (emerald, gold leaf, ${design.metal}). Purely geometric and floral — NO human or animal figures of any kind.

Ornate ${design.metal}-leaf border with ${design.border} frames the entire cover.

At the TOP of the cover, centered horizontally: "${sura.tname}" in raised gold-leaf serif lettering — the letters are embossed and catch warm light. The text must be EXACTLY "${sura.tname}" with all diacritical marks.

At the BOTTOM of the cover, centered horizontally: "The Qurʼán · Sura ${sura.index}" in smaller gold-leaf serif lettering.

Hyper-detailed macro photography quality. The embossed central calligraphy and surrounding geometric art should be the focal point — richly colored with deep saturated jewel tones, detailed, with strong dimensional depth from the tooled leather relief. The overall feel is dark, luxurious, and ancient — like a precious artifact photographed in dramatic museum lighting. No modern elements, no digital artifacts. No human faces or figures of any kind.

CRITICAL: The background behind the book must be SOLID PURE MAGENTA (#FF00FF) with absolutely no variation, shadow, or gradient. The book's natural worn edges and corners should be clearly visible against this green.`;
}

async function generateQuranCover(sura, model, dryRun) {
  const slug = `quran-${suraSlug(sura.tname)}`;
  const outfile = join(COVERS_DIR, `${slug}.png`);

  if (skipExisting && existsSync(outfile)) {
    console.log(`  SKIP: ${slug} (already exists)`);
    return 'skip';
  }

  const palette = sura.type === 'Meccan' ? QURAN_PALETTE.meccan : QURAN_PALETTE.medinan;
  const hash = simpleHash(slug);
  const leatherVar = QURAN_LEATHER_VARIANTS[hash % QURAN_LEATHER_VARIANTS.length];
  const borderExtra = QURAN_BORDER_EXTRAS[(hash >> 2) % QURAN_BORDER_EXTRAS.length];

  const design = {
    leather: `${palette.leather} ${leatherVar}`,
    metal: palette.metal,
    border: `${palette.borderStyle} with ${borderExtra}`,
    motif: SURA_MOTIFS[sura.index] || 'an elaborate Islamic geometric mandala with interlocking circles and hexagons',
  };

  console.log(`\n  [${slug}] Sura ${sura.index}: ${sura.tname} (${sura.ename})`);
  console.log(`  Type: ${sura.type} | Metal: ${design.metal}`);
  console.log(`  Motif: ${design.motif.slice(0, 100)}...`);

  if (dryRun) {
    console.log(`  DRY RUN: would generate cover`);
    return true;
  }

  const prompt = buildQuranPrompt(sura, design);

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
      const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const buffer = await chromaKeyAndTrim(rawBuffer);
      writeFileSync(outfile, buffer);
      const meta = await sharp(buffer).metadata();
      console.log(`  ✓ Saved: ${slug}.png ${meta.width}x${meta.height} (${(buffer.length / 1024).toFixed(0)}KB)`);

      const textPart = parts.find(p => p.text);
      if (textPart) console.log(`  Model: ${textPart.text.slice(0, 100)}`);
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
const quranMode = process.argv.includes('--quran');
const modelFlag = process.argv.find(a => a.startsWith('--model='));
const MODEL = modelFlag ? modelFlag.split('=')[1] : 'gemini-3-pro-image-preview';
const target = args[0];

async function main() {
  if (quranMode) {
    console.log(`Qurʼán sura cover generation (${MODEL})`);
    console.log(`Options: skip-existing=${skipExisting}, dry-run=${dryRun}\n`);

    const suras = loadQuranSuras();
    console.log(`Loaded ${suras.length} suras\n`);

    const subset = target
      ? suras.filter(s => suraSlug(s.tname) === target || String(s.index) === target)
      : suras;

    if (target && subset.length === 0) {
      console.error(`Sura not found: ${target}`);
      process.exit(1);
    }

    let success = 0, fail = 0, skip = 0;
    for (let i = 0; i < subset.length; i++) {
      const result = await generateQuranCover(subset[i], MODEL, dryRun);
      if (result === 'skip') { skip++; success++; }
      else if (result) { success++; }
      else { fail++; }
      if (!dryRun && result !== 'skip' && i < subset.length - 1) {
        console.log('  ⏳ Waiting 5s...');
        await delay(10000);
      }
    }
    console.log(`\n  Done: ${success} generated (${skip} skipped), ${fail} failed out of ${subset.length} suras`);
  } else {
    console.log(`Book cover generation (${MODEL})`);
    console.log(`Options: skip-existing=${skipExisting}, dry-run=${dryRun}\n`);

    const works = loadAllWorks();
    console.log(`Loaded ${works.length} works\n`);

    if (target) {
      const work = works.find(w => w.doc_id === target);
      if (!work) { console.error(`Work not found: ${target}`); process.exit(1); }
      await generateCover(work, MODEL, dryRun);
    } else {
      works.sort((a, b) => a.author_slug.localeCompare(b.author_slug) || a.doc_id.localeCompare(b.doc_id));
      let success = 0, fail = 0;
      for (let i = 0; i < works.length; i++) {
        const ok = await generateCover(works[i], MODEL, dryRun);
        if (ok) success++; else fail++;
        if (!dryRun && i < works.length - 1) {
          console.log('  ⏳ Waiting 5s...');
          await delay(10000);
        }
      }
      console.log(`\n  Done: ${success} generated, ${fail} failed out of ${works.length} works`);
    }
  }
}

main();
