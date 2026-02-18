import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import fs from 'node:fs';
import path from 'node:path';

// Build corpus URLs from pre-computed search indexes for SSR paragraph pages
const corpusDir = path.resolve('src/content/corpus');
const corpusPages = [];
if (fs.existsSync(corpusDir)) {
  for (const work of fs.readdirSync(corpusDir)) {
    const metaPath = path.join(corpusDir, work, '_meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (meta.search_index) {
      for (const entry of meta.search_index) {
        corpusPages.push(`https://ctai.info/examples/${work}/${entry.s}/`);
      }
    }
  }
}

// Build concordance URLs from pre-computed index
const concordanceIndexPath = path.resolve('public/_concordance-index.json');
const concordancePages = ['https://ctai.info/concordance/'];
if (fs.existsSync(concordanceIndexPath)) {
  const idx = JSON.parse(fs.readFileSync(concordanceIndexPath, 'utf-8'));
  for (const [, slug] of idx.en) {
    concordancePages.push(`https://ctai.info/concordance/english/${slug}/`);
  }
  for (const [, translit] of idx.roots) {
    concordancePages.push(`https://ctai.info/concordance/root/${encodeURIComponent(translit)}/`);
  }
}

export default defineConfig({
  adapter: cloudflare(),
  integrations: [svelte(), tailwind(), sitemap({
    customPages: [...corpusPages, ...concordancePages],
    filter: (page) => {
      if (page.includes('/dashboard')) return false;
      return true;
    },
    serialize: (item) => {
      const url = item.url;
      if (url === 'https://ctai.info/' || url === 'https://ctai.info') {
        item.priority = 1.0;
        item.changefreq = 'monthly';
      }
      else if (/\/concordance\/?$/.test(url)) {
        item.priority = 0.8;
        item.changefreq = 'monthly';
      }
      else if (/\/concordance\/(english|root)\//.test(url)) {
        item.priority = 0.5;
        item.changefreq = 'monthly';
      }
      else if (/\/(examples|works|articles)\/?$/.test(url)) {
        item.priority = 0.8;
        item.changefreq = 'monthly';
      }
      else if (/\/examples\/[^/]+\/?$/.test(url) || /\/works\/[^/]+\/?$/.test(url)) {
        item.priority = 0.6;
        item.changefreq = 'monthly';
      }
      else if (/\/examples\/[^/]+\/\d+-/.test(url)) {
        item.priority = 0.5;
        item.changefreq = 'monthly';
      }
      else {
        item.priority = 0.4;
        item.changefreq = 'yearly';
      }
      return item;
    },
  })],
  site: 'https://ctai.info',
  server: { port: 1919 },
  vite: {
    ssr: {
      external: ['better-sqlite3', '@anthropic-ai/sdk'],
    },
    optimizeDeps: {
      include: ['svelte'],
      exclude: ['@astrojs/svelte'],
    },
  },
});
