#!/usr/bin/env node
import { execSync } from 'child_process';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const coversDir = join(projectRoot, 'covers');
const bucket = 'languagelab-covers';
const keyPrefix = 'ctai/';
const accountId = 'b750d0f7242bbc76f115f72840453083';

// Read wrangler OAuth token
function getToken() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const paths = [
    join(home, 'Library/Preferences/.wrangler/config/default.toml'),
    join(home, '.wrangler/config/default.toml'),
    join(home, '.config/.wrangler/config/default.toml'),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, 'utf8');
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } catch {}
  }
  throw new Error('Could not find wrangler OAuth token');
}

// List all R2 objects under prefix, returns Map<filename, etag>
async function listR2Objects(token) {
  const remote = new Map();
  let cursor = '';
  while (true) {
    const params = new URLSearchParams({ prefix: keyPrefix, per_page: '500' });
    if (cursor) params.set('cursor', cursor);
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!json.success) throw new Error('R2 list failed: ' + JSON.stringify(json.errors));
    for (const obj of json.result) {
      const filename = obj.key.replace(keyPrefix, '');
      remote.set(filename, obj.etag);
    }
    if (!json.result_info?.is_truncated) break;
    cursor = json.result_info.cursor;
  }
  return remote;
}

function md5(filePath) {
  return createHash('md5').update(readFileSync(filePath)).digest('hex');
}

// Main
const token = getToken();
console.log('Fetching R2 object list...');
const remote = await listR2Objects(token);
console.log(`R2 has ${remote.size} objects under ${keyPrefix}`);

console.log('Scanning local covers...');
const files = readdirSync(coversDir)
  .filter(f => f.endsWith('.png'))
  .filter(f => statSync(join(coversDir, f)).isFile());

const toUpload = files.filter(f => {
  const remoteEtag = remote.get(f);
  if (!remoteEtag) return true; // new file
  const localMd5 = md5(join(coversDir, f));
  return localMd5 !== remoteEtag;
});

console.log(`Found ${files.length} local PNGs, ${toUpload.length} need uploading (${files.length - toUpload.length} unchanged)\n`);

if (toUpload.length === 0) {
  console.log('Nothing to upload — all covers match R2.');
  process.exit(0);
}

let uploaded = 0;
let failed = 0;
for (const file of toUpload) {
  const filePath = join(coversDir, file);
  const key = `${keyPrefix}${file}`;
  try {
    console.log(`Uploading ${file}...`);
    execSync(
      `wrangler r2 object put ${bucket}/${key} --file="${filePath}" --remote`,
      { stdio: 'inherit', cwd: projectRoot }
    );
    uploaded++;
    console.log(`✓ ${file} -> ${key}\n`);
  } catch (error) {
    failed++;
    console.error(`✗ Failed to upload ${file}:`, error.message, '\n');
  }
}

console.log('Upload complete:');
console.log(`  Uploaded: ${uploaded}`);
console.log(`  Skipped: ${files.length - toUpload.length}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${files.length}`);
