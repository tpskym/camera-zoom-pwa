const CACHE = 'faceup-v1.56.0';
const APP_ROOT = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const APP_FILES = [APP_ROOT, INDEX_URL, new URL('./styles.css?v=1.56.0', self.registration.scope).href, new URL('./app.js?v=1.56.0', self.registration.scope).href, new URL('./manifest.webmanifest?v=1.56.0', self.registration.scope).href, new URL('./icon.svg', self.registration.scope).href, new URL('./icon-maskable.svg', self.registration.scope).href];

async function saveAppShell() {
  const cache = await caches.open(CACHE);
  await Promise.all(APP_FILES.map(async url => {
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!response.ok) throw new Error(`Не удалось сохранить ${url}`);
    await cache.put(url, response);
  }));
}
self.addEventListener('install', event => event.waitUntil(saveAppShell().then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const shell = (await caches.match(APP_ROOT)) || (await caches.match(INDEX_URL));
      if (shell) return shell;
    }
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE); await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      if (event.request.mode === 'navigate') return new Response('FaceUp ещё не готов для работы без интернета.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return new Response('', { status: 504 });
    }
  })());
});
