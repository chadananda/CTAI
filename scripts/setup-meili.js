#!/usr/bin/env node
/**
 * Create and configure Meilisearch indexes.
 * Reads: MEILI_URL, MEILI_API_KEY, OPENAI_API_KEY from env
 */
import { MeiliSearch } from 'meilisearch';

const MEILI_URL = process.env.MEILI_URL || 'http://localhost:7700';
const MEILI_API_KEY = process.env.MEILI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

async function main() {
  const client = new MeiliSearch({ host: MEILI_URL, apiKey: MEILI_API_KEY });

  // --- phrases index ---
  console.log('Creating phrases index...');
  await client.createIndex('phrases', { primaryKey: 'id' });
  const phrases = client.index('phrases');

  await phrases.updateSearchableAttributes(['source_text', 'translation', 'full_text']);
  await phrases.updateFilterableAttributes(['work', 'slug', 'source_lang', 'author']);
  await phrases.updateSortableAttributes(['pair_index']);
  await phrases.updateSearchCutoffMs(1500);

  if (OPENAI_API_KEY) {
    await phrases.updateEmbedders({
      default: {
        source: 'openAi',
        apiKey: OPENAI_API_KEY,
        model: 'text-embedding-3-small',
        documentTemplate: '{{doc.full_text}}',
      },
    });
    console.log('  Configured OpenAI embedder for phrases');
  } else {
    console.log('  OPENAI_API_KEY not set — skipping embedder config');
  }

  // --- concepts index ---
  console.log('Creating concepts index...');
  await client.createIndex('concepts', { primaryKey: 'id' });
  const concepts = client.index('concepts');

  await concepts.updateSearchableAttributes(['text']);
  await concepts.updateFilterableAttributes(['work', 'author', 'language', 'doc_id']);
  await concepts.updateSortableAttributes(['chunk_index']);
  await concepts.updateSearchCutoffMs(1500);

  if (OPENAI_API_KEY) {
    await concepts.updateEmbedders({
      default: {
        source: 'openAi',
        apiKey: OPENAI_API_KEY,
        model: 'text-embedding-3-small',
        documentTemplate: '{{doc.text}}',
      },
    });
    console.log('  Configured OpenAI embedder for concepts');
  } else {
    console.log('  OPENAI_API_KEY not set — skipping embedder config');
  }

  console.log('Done. Indexes created and configured.');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
