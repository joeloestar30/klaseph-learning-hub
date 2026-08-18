const CACHE = "klaseph-learning-hub-v15";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=15",
  "./auth-enhancements.css?v=15",
  "./mobile-enhancements.css?v=15",
  "./config.js?v=15",
  "./app.js?v=15",
  "./auth-enhancements.js?v=15",
  "./onboarding-persistence.js?v=15",
  "./mobile-enhancements.js?v=15",
  "./manifest.json",
  "./assets/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
