#!/usr/bin/env node
import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const coversDir = join(projectRoot, 'covers');
const bucket = 'languagelab-covers';
const keyPrefix = 'ctai/';
console.log('Scanning covers directory:', coversDir);
const files = readdirSync(coversDir)
  .filter(f => f.endsWith('.png'))
  .filter(f => {
    const fullPath = join(coversDir, f);
    return statSync(fullPath).isFile();
  });
console.log(`Found ${files.length} PNG files to upload\n`);
let uploaded = 0;
let failed = 0;
for (const file of files) {
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
console.log(`  Failed: ${failed}`);
console.log(`  Total: ${files.length}`);
