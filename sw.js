/* EmojiSpot — offline support
 *
 * Strategy: NETWORK-FIRST with cache fallback.
 * Cache-first would be marginally faster, but it means a reader who visited once
 * keeps seeing that snapshot forever — including while the site is being
 * rebuilt. Network-first guarantees fresh content when online, and the cache
 * still takes over the moment the network is unavailable.
 */
const CACHE = 'emoji-v6';
const CORE = ['/', '/data/emoji.json', '/data/i18n.json',
              '/assets/css/site.css', '/assets/js/site.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then(hit => hit || caches.match('/'))
      )
  );
});

/* let the page force an update through */
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
