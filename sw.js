/**
 * PWA Service Worker
 * Network-first strategy for development. Caches for offline fallback only.
 */
const CACHE_NAME = 'memorization-quiz-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/dashboard.js',
  './js/app.js',
  './manifest.json'
];

// Install Event - Pre-cache resources
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Remove ALL old caches immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network first, cache fallback
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip caching for API endpoints
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network first: always try to get fresh content
  e.respondWith(
    fetch(e.request).then((networkResponse) => {
      if (networkResponse.status === 200) {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return networkResponse;
    }).catch(() => {
      // Offline fallback to cache
      return caches.match(e.request);
    })
  );
});
