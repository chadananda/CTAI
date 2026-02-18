import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  adapter: cloudflare(),
  integrations: [svelte(), tailwind(), sitemap({
    filter: (page) => {
      if (page.includes('/dashboard')) return false;
      if (/\/examples\/[^/]+\/\d+\/?$/.test(page)) return false;
      return true;
    },
    serialize: (item) => {
      const url = item.url;
      if (url === 'https://ctai.info/' || url === 'https://ctai.info') {
        item.priority = 1.0;
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
