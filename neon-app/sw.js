const CACHE = 'klaseph-neon-shell-v2';
const ASSETS = ['./','./index.html','./styles.css?v=neon1','./auth-enhancements.css?v=neon1','./mobile-enhancements.css?v=neon1','./ellna.css','./ellna.js','./manifest.json','./assets/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('klaseph-neon-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Auth and student records are never cached by the service worker.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.some(asset => new URL(asset,self.location).href === url.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request,copy))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
