const CACHE_NAME = 'ji2026-v29';
const STATIC_ASSETS = [
  '/',
  './index.html',
  './styles.css',
  './app.js',
  './questions.js',
  './manifest.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Añadir ?v=timestamp a las URLs para evitar caché HTTP del navegador
        const timestamp = new Date().getTime();
        const requests = STATIC_ASSETS.map(url => {
          const separator = url.includes('?') ? '&' : '?';
          return new Request(url + separator + 'v=' + timestamp);
        });
        return cache.addAll(requests);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // ignoreSearch permite que 'index.html?v=timestamp' haga match con 'index.html'
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Don't cache bad responses or cross-origin fonts blindly, but we do for static
          return response;
        });
      })
  );
});
