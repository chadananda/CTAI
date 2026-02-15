import { MeiliSearch } from 'meilisearch';

let client;

export function getClient() {
  if (!client) {
    client = new MeiliSearch({
      host: import.meta.env.MEILI_URL || process.env.MEILI_URL || 'http://localhost:7700',
      apiKey: import.meta.env.MEILI_SEARCH_KEY || process.env.MEILI_SEARCH_KEY || '',
    });
  }
  return client;
}

export async function searchPhrases(query, opts = {}) {
  const index = getClient().index('phrases');
  return index.search(query, {
    hybrid: { semanticRatio: 0.7, embedder: 'default' },
    limit: opts.limit || 20,
    filter: opts.filter || undefined,
    attributesToHighlight: ['translation', 'source_text'],
    ...opts,
  });
}

export async function searchConcepts(query, opts = {}) {
  const index = getClient().index('concepts');
  return index.search(query, {
    hybrid: { semanticRatio: 0.7, embedder: 'default' },
    limit: opts.limit || 20,
    filter: opts.filter || undefined,
    attributesToHighlight: ['text'],
    ...opts,
  });
}
