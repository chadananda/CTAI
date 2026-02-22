#!/usr/bin/env node
// Generate a wax seal with "ولي امر الله" (Guardian of the Cause of God)
// in Arabic calligraphy, on magenta background for chroma-key to transparent.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

const CWD = process.cwd();
const envContent = readFileSync(resolve(CWD, '.env'), 'utf-8');
const apiKey = envContent.match(/GEMINI_API_KEY="([^"]+)"/)?.[1];
const MODEL = 'gemini-3-pro-image-preview';

const prompt = `A single circular wax seal stamp impression, photographed from directly above against a SOLID BRIGHT MAGENTA (#FF00FF) background.

The seal is made of deep crimson-red wax with realistic texture — slightly glossy surface, natural irregularities, tiny bubbles, and authentic pressed edges where the wax spread under pressure.

In the CENTER of the seal, the Arabic calligraphic text "ولي امر الله" (Valí Amru'lláh — Guardian of the Cause of God) is deeply impressed in elegant ornamental Thuluth or Diwani calligraphy. The text flows in a circular arrangement fitting naturally within the round seal.

Around the text, a delicate border of tiny dots or a thin raised rim typical of authentic wax seals.

The seal should be approximately 2 inches in diameter in appearance. Hyper-detailed macro photography quality with dramatic lighting that reveals the depth of the impression and the texture of the wax.

CRITICAL REQUIREMENTS:
- The wax seal must be perfectly CIRCULAR
- Background must be SOLID PURE MAGENTA (#FF00FF) with no shadows, gradients, or variations
- No other objects in the image — just the single wax seal on magenta
- The Arabic text must be EXACTLY "ولي امر الله"
- No human figures or faces`;

console.log('Generating wax seal...');
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '1:1' }
      }
    })
  }
);

if (!response.ok) {
  console.error('API error:', response.status, (await response.text()).slice(0, 500));
  process.exit(1);
}

const data = await response.json();
const parts = data.candidates?.[0]?.content?.parts || [];
const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
const textPart = parts.find(p => p.text);
if (textPart) console.log('Model:', textPart.text.slice(0, 200));

if (!imagePart) {
  console.log('No image:', JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

const rawBuf = Buffer.from(imagePart.inlineData.data, 'base64');
writeFileSync('tmp/wax-seal-raw.png', rawBuf);
console.log('Raw saved to tmp/wax-seal-raw.png');

// Chroma-key magenta to transparent (same pipeline as covers)
const { data: px, info } = await sharp(rawBuf)
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height;
const out = Buffer.from(px);

// Sample corners for background color
const sz = 15;
let sr = 0, sg = 0, sb = 0, n = 0;
for (let y = 0; y < sz; y++)
  for (let x = 0; x < sz; x++)
    for (const [ox, oy] of [[0,0],[w-sz,0],[0,h-sz],[w-sz,h-sz]]) {
      const gi = ((y + oy) * w + (x + ox)) * 4;
      sr += px[gi]; sg += px[gi+1]; sb += px[gi+2]; n++;
    }
const bgR = sr/n, bgG = sg/n, bgB = sb/n;

// Flood-fill from corners
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

// Despill magenta from edges
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
    const magenta = (r + b) / 2 - g;
    if (magenta > 30) {
      out[gi] = Math.min(r, g + 10);
      out[gi + 2] = Math.min(b, g + 10);
    }
  }
}

const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .png().toBuffer();
const trimmed = await sharp(png).trim().toBuffer({ resolveWithObject: true });
const pad = 8;
const final = await sharp(trimmed.data)
  .extend({ top: pad, bottom: pad, left: pad, right: pad,
            background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toBuffer();

writeFileSync('tmp/wax-seal.png', final);
const meta = await sharp(final).metadata();
console.log(`Saved: tmp/wax-seal.png ${meta.width}x${meta.height}`);
