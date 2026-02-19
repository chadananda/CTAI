#!/usr/bin/env node
// Generate book cover images using Gemini Imagen 4.0 + rembg background removal
// Usage: node scripts/generate-covers.js [slug] [--skip-existing]
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import sharp from 'sharp';

const CWD = process.cwd();
const COVERS_DIR = join(CWD, 'covers');
const RAW_DIR = join(COVERS_DIR, 'raw');
const CORPUS_DIR = join(CWD, 'src/content/corpus');
const REMBG = '/tmp/rembg-venv/bin/rembg';

mkdirSync(RAW_DIR, { recursive: true });

const envContent = readFileSync(resolve(CWD, '.env'), 'utf-8');
const apiKey = envContent.match(/GEMINI_API_KEY="([^"]+)"/)?.[1];
if (!apiKey) { console.error('ERROR: GEMINI_API_KEY not found in .env'); process.exit(1); }

if (!existsSync(REMBG)) {
  console.error(`ERROR: rembg not found at ${REMBG}`);
  console.error('Install: /opt/homebrew/bin/python3.13 -m venv /tmp/rembg-venv && /tmp/rembg-venv/bin/pip install "rembg[cpu,cli]"');
  process.exit(1);
}

const COVERS = {
  'prayers-and-meditations': {
    leather: 'deep burgundy-wine',
    border: 'Persian arabesques and interlocking geometric rosettes',
    scene: 'an ornate mihrab prayer niche with radiating golden light, intricate Islamic geometric patterns filling the arch, a single lit candle at the center casting warm amber glow. Devotional, contemplative, sacred atmosphere'
  },
  'gleanings': {
    leather: 'rich dark mahogany brown',
    border: 'scattered gemstones and classical laurel wreaths',
    scene: 'a radiant arrangement of faceted gemstones — ruby, emerald, sapphire, topaz — set in an ornate golden filigree mandala pattern, each gem catching prismatic light. At the center, a luminous pearl rests on an open ancient book. Reverence, majesty, divine scripture'
  },
  'kitab-i-iqan': {
    leather: 'deep royal indigo with purple undertones',
    border: 'illuminated manuscript vine-scrolls and celestial stars',
    scene: 'a radiant open book with golden light streaming upward from its pages into a starfield, seven celestial orbs arranged in an arc above. The light dispels surrounding darkness. Revelation, certitude, divine knowledge'
  },
  'the-hidden-words': {
    leather: 'deep teal-green with gold undertones',
    border: 'garden lattice with jasmine and nightingale silhouettes',
    scene: 'a walled Persian garden at dawn, a hidden pathway leading through dense flowering bushes to a luminous clearing, morning dew glistening on rose petals. A sealed golden casket rests on a stone pedestal. Mystery, hidden treasure, paradise'
  },
  'epistle-to-the-son-of-the-wolf': {
    leather: 'dark charcoal black with deep red undertones',
    border: 'Gothic tracery and stylized wolf silhouettes in chains',
    scene: 'an imposing wax seal with a royal crest, surrounded by heavy ornate chains and a golden quill crossed with a sword of light. Deep embossed leather relief only — no paper, no letter, no printed elements. Authority, finality, prophetic address'
  },
  'tablet-of-ahmad': {
    leather: 'warm golden amber-brown',
    border: 'flame motifs and Persian calligraphic flourishes',
    scene: 'a dramatic duality — on one side, a towering flame of fire blazing upward in brilliant gold and crimson; on the other side, a flowing river of luminous blue-white water cascading downward. Where fire and water meet at the center, a radiant golden nightingale sings. Spiritual power, devotion, fire and life eternal'
  },
  'tablet-of-carmel': {
    leather: 'deep olive green with earth tones',
    border: 'Mediterranean cypress branches and terraced gardens',
    scene: 'a narrow winding path of stone terraces ascending a sacred mountain, inspired by St. John of the Cross Ascent of Mount Carmel. Terraced gardens line each level, cypress trees flanking the path. At the summit, a radiant golden throne of light glows against parting clouds. The Mediterranean sea glimmers far below. Mystical ascent, sacred mountain, divine throne'
  },
  'tablet-of-the-holy-mariner': {
    leather: 'deep navy blue with silver undertones',
    border: 'ocean waves, anchor chains, and compass rose motifs',
    scene: 'a luminous celestial ark sailing on a vast star-reflecting ocean under a canopy of brilliant stars, the ship glowing with inner golden light, billowing white sails catching ethereal wind. Mystical, oceanic, heavenly voyage'
  },
  'fire-tablet': {
    leather: 'dark crimson-red with burnt orange undertones',
    border: 'rising flames and phoenix feathers in gold',
    scene: 'sacred flames rising from an ornate golden altar or brazier, the fire transforming into a pillar of brilliant light reaching upward, sparks becoming stars. The flames are beautiful not destructive — purifying, transcendent. Passion, suffering transformed into glory'
  },
  'kitab-i-ahd': {
    leather: 'deep plum-purple with gold highlights',
    border: 'intertwined covenant knots and royal seals',
    scene: 'an ancient ornate document with a magnificent crimson wax seal, golden cord binding the scroll, placed on a marble throne. A crown of light hovers above. Covenant, succession, sacred authority, royal decree'
  },
  'will-and-testament': {
    leather: 'dark slate blue-gray with silver highlights',
    border: 'architectural columns, globe motifs, and olive branches',
    scene: 'a classical domed rotunda or tholos with a ring of slender Corinthian columns supporting an elegant dome, standing on concentric broadening circular stone steps. Above the dome, a brilliant full moon radiates silver-white light that illuminates the entire scene from above. The moonlight bathes the columns and dome in ethereal glow. The structure is monumental, sacred, architectural — like a shrine or mausoleum. Institutional grandeur, sacred authority, luminous order'
  },
};

function buildPrompt(title, author, design) {
  return `Photorealistic flat lay photograph of the front cover of an antique hand-crafted leather-bound book, shot straight on from directly above against a PURE SOLID WHITE background. The background behind and around the book is completely white, bright, and uniform — no shadows, no gradients, no dark areas, no surface texture. The ENTIRE book is fully visible — all four corners, all four edges, the complete rectangle of the cover with NOTHING cropped or clipped. There is a generous margin of white space around the book on all sides so the book floats freely with clear separation from the image edges. The leather is rich aged ${design.leather} with visible grain, wear marks, and patina. The cover features a deeply embossed and tooled illustration in the center — raised leather relief with hand-painted color details in jewel tones (deep ruby, emerald, gold leaf, sapphire) worked into the tooled leather. Ornate gold-leaf border with ${design.border} frames the illustration. The book title is deeply stamped in thick heavy gold leaf capital letters at the top, occupying a full third of the cover height — the lettering is large, ornate, and unmissable. NO text at the bottom of the cover — the bottom area is occupied only by the ornate gold-leaf border pattern. Subtle warm lighting that emphasizes the depth and texture of the embossing.

BOOK: "${title}". The embossed center illustration shows ${design.scene}.

Hyper-detailed macro photography quality. The embossed illustration should be the focal point — richly colored, character-focused with dimensional depth from the tooled leather relief. CRITICAL FRAMING: The book must be FULLY CONTAINED within the image — every edge and corner of the book clearly visible with white space around it. The book should occupy about 85% of the image area, centered, with breathing room on all sides. No cropping, no clipping, no edges cut off. No shadows on the white background. No modern elements, no digital artifacts. No human faces or figures of any kind.`;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function removeBackground(inputPath, outputPath) {
  const tmpOut = outputPath + '.tmp.png';
  execSync(`${REMBG} i "${inputPath}" "${tmpOut}"`, { stdio: 'pipe' });
  const output = await sharp(tmpOut).trim().png().toBuffer();
  const meta = await sharp(output).metadata();
  await sharp(output).toFile(outputPath);
  try { unlinkSync(tmpOut); } catch {}
  return { width: meta.width, height: meta.height, size: output.length };
}

async function generateCover(slug) {
  const metaPath = join(CORPUS_DIR, slug, '_meta.json');
  if (!existsSync(metaPath)) { console.log(`  SKIP: ${slug} (no _meta.json)`); return false; }

  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  const design = COVERS[slug];
  if (!design) { console.log(`  SKIP: ${slug} (no design)`); return false; }

  const outfile = join(COVERS_DIR, `${slug}.png`);
  if (skipExisting && existsSync(outfile)) {
    console.log(`  SKIP: ${slug} (already exists)`);
    return true;
  }

  const prompt = buildPrompt(meta.title, meta.author, design);

  console.log(`\n  Generating: ${slug}`);
  console.log(`  Title: "${meta.title}" — Leather: ${design.leather}`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '3:4',
            safetyFilterLevel: 'block_some',
            personGeneration: 'dont_allow'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ✗ API error (${response.status}):`, errorText.slice(0, 300));
      return false;
    }

    const data = await response.json();

    if (data.predictions?.[0]?.bytesBase64Encoded) {
      const buffer = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
      const rawFile = join(RAW_DIR, `${slug}.png`);
      writeFileSync(rawFile, buffer);
      console.log(`  ✓ Raw: ${(buffer.length / 1024).toFixed(0)}KB`);

      // Remove background with rembg
      const result = await removeBackground(rawFile, outfile);
      console.log(`  ✓ Processed: ${result.width}x${result.height} (${(result.size / 1024).toFixed(0)}KB)`);
      return true;
    }

    console.log(`  ✗ No image generated for: ${slug}`);
    return false;
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return false;
  }
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const skipExisting = process.argv.includes('--skip-existing');
const target = args[0];

async function main() {
  console.log('Book cover generation (Gemini Imagen 4.0 + rembg)\n');

  if (target) {
    await generateCover(target);
  } else {
    const slugs = Object.keys(COVERS);
    let success = 0, fail = 0;
    for (let i = 0; i < slugs.length; i++) {
      const ok = await generateCover(slugs[i]);
      ok ? success++ : fail++;
      if (i < slugs.length - 1) {
        console.log('  Waiting 5s...');
        await delay(5000);
      }
    }
    console.log(`\n  Done: ${success}/${slugs.length} generated, ${fail} failed`);
  }
}

main();
