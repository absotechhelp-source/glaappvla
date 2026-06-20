/**
 * VLA GLA Pricing Engine — Service Worker v1.0
 * Cache the app shell for offline quote generation.
 * All GAS/Google requests bypass the cache (always go to network).
 */
const CACHE_NAME = 'vla-gla-v1';
const SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(SHELL); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(k){ return k !== CACHE_NAME; })
              .map(function(k){ return caches.delete(k); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // Always use network for GAS calls (quotes need live server engine)
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (e.request.method === 'GET' && resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c){ c.put(e.request, clone); });
        }
        return resp;
      });
    }).catch(function() {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
    })
  );
});

self.addEventListener('message', function(e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
