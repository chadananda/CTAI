const CACHE_NAME = 'ctai-fonts-v1';
const FONT_URLS = [
  '/fonts/source-serif-4-latin-normal.woff2',
  '/fonts/source-serif-4-latin-italic.woff2',
  '/fonts/source-serif-4-latin-ext-normal.woff2',
  '/fonts/source-serif-4-latin-ext-italic.woff2',
  '/fonts/eb-garamond-latin-normal.woff2',
  '/fonts/eb-garamond-latin-italic.woff2',
  '/fonts/eb-garamond-latin-ext-normal.woff2',
  '/fonts/eb-garamond-latin-ext-italic.woff2',
  '/fonts/scheherazade-new-arabic-normal-400.woff2',
  '/fonts/scheherazade-new-arabic-normal-700.woff2',
  '/fonts/scheherazade-new-latin-normal-400.woff2',
  '/fonts/scheherazade-new-latin-normal-700.woff2',
  '/fonts/jetbrains-mono-latin-normal.woff2',
  '/fonts/jetbrains-mono-latin-ext-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FONT_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
