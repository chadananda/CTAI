#!/usr/bin/env node
/**
 * Upload documents to Meilisearch indexes.
 * Reads: tmp/phrases.json, tmp/concepts.json
 * Env: MEILI_URL, MEILI_API_KEY
 */
import fs from 'node:fs';
import path from 'node:path';
import { MeiliSearch } from 'meilisearch';

const MEILI_URL = process.env.MEILI_URL || 'http://localhost:7700';
const MEILI_API_KEY = process.env.MEILI_API_KEY || '';
const BATCH_SIZE = 500;

async function uploadBatched(index, docs) {
  const tasks = [];
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const task = await index.addDocuments(batch);
    tasks.push(task);
    console.log(`  Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} docs)`);
  }
  return tasks;
}

async function waitForTasks(client, tasks) {
  for (const task of tasks) {
    await client.waitForTask(task.taskUid, { timeOutMs: 120000 });
  }
}

async function main() {
  const client = new MeiliSearch({ host: MEILI_URL, apiKey: MEILI_API_KEY });
  const tmpDir = path.resolve('tmp');

  // Upload phrases
  const phrasesPath = path.join(tmpDir, 'phrases.json');
  if (fs.existsSync(phrasesPath)) {
    const phrases = JSON.parse(fs.readFileSync(phrasesPath, 'utf-8'));
    console.log(`Uploading ${phrases.length} phrases...`);
    const tasks = await uploadBatched(client.index('phrases'), phrases);
    console.log('Waiting for phrases indexing...');
    await waitForTasks(client, tasks);
    const stats = await client.index('phrases').getStats();
    console.log(`  phrases: ${stats.numberOfDocuments} documents indexed`);
  } else {
    console.log('No phrases.json found — run npm run parse-corpus first');
  }

  // Upload concepts
  const conceptsPath = path.join(tmpDir, 'concepts.json');
  if (fs.existsSync(conceptsPath)) {
    const concepts = JSON.parse(fs.readFileSync(conceptsPath, 'utf-8'));
    console.log(`Uploading ${concepts.length} concepts...`);
    const tasks = await uploadBatched(client.index('concepts'), concepts);
    console.log('Waiting for concepts indexing...');
    await waitForTasks(client, tasks);
    const stats = await client.index('concepts').getStats();
    console.log(`  concepts: ${stats.numberOfDocuments} documents indexed`);
  } else {
    console.log('No concepts.json found — run npm run segment first');
  }

  console.log('Indexing complete.');
}

main().catch(err => {
  console.error('Indexing failed:', err.message);
  process.exit(1);
});
