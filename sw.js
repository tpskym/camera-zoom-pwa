const CACHE = 'faceup-v1.11.0';
const APP_FILES = ['./', './index.html', './styles.css?v=1.11.0', './app.js?v=1.11.0', './manifest.webmanifest?v=1.11.0', './icon.svg', './icon-maskable.svg'];

// Сначала сохраняем оболочку приложения — тогда оно откроется без интернета.
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response('FaceUp ещё не был сохранён для работы офлайн.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
