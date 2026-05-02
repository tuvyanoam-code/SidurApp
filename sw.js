/* Service worker — offline-first cache for the prayer files. */
const VERSION = 'sidur-v8';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './prayers.js',
  './parshas.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if(req.method !== 'GET') return;
  // Network-first for Hebcal & Sefaria — fall back to whatever's in cache
  const u = new URL(req.url);
  if(/hebcal\.com|sefaria\.org/.test(u.host)){
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  // Cache-first for everything else (the static app shell & prayer text)
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if(res && res.ok && u.origin === self.location.origin){
        const clone = res.clone();
        caches.open(VERSION).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => cached))
  );
});
