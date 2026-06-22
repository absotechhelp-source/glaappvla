/**
 * VLA Group Life Pricing Engine — Service Worker
 *
 * HOW TO FORCE ALL DEVICES TO PICK UP A NEW DEPLOYMENT:
 *   1. Bump CACHE_VERSION (e.g. 'v4' → 'v5')
 *   2. Re-deploy index.html + this sw.js together
 *   The new SW installs, activates immediately (skipWaiting),
 *   deletes the old cache, and reloads every open tab automatically.
 *
 * Architecture:
 *   • HTML navigation  → network-first (always tries to get the latest index.html)
 *   • Other same-origin assets → cache-first (fast offline support)
 *   • External requests (GAS API, CDN libs) → pass-through (never cached here)
 */

const CACHE_VERSION = 'vla-gla-v7';   // ← bump this string on every new deployment
const CACHE_NAME    = CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
];

// ── INSTALL ─────────────────────────────────────────────────────────────────
// Cache core assets and activate immediately (don't wait for tabs to close).
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate straight away
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
// Delete every cache that isn't the current version, then claim all open tabs
// so they immediately benefit from the new SW without needing a manual refresh.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())   // take control of existing tabs
  );
});

// ── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;  // never intercept POST / non-GET

  const url = new URL(req.url);

  // Let external requests (GAS, CDN libs) go straight to the network.
  if (url.origin !== self.location.origin) return;

  // HTML navigation → network-first so devices always get the latest app shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(netRes => {
          if (netRes && netRes.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(req, netRes.clone()));
          }
          return netRes;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // All other same-origin assets → cache-first for speed / offline.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(netRes => {
        if (netRes && netRes.status === 200) {
          caches.open(CACHE_NAME).then(c => c.put(req, netRes.clone()));
        }
        return netRes;
      });
    })
  );
});

// ── MESSAGES FROM THE PAGE ───────────────────────────────────────────────────
// The page's SW registration code sends 'skipWaiting' when it detects a new
// version is waiting. We honour it here so the update takes effect immediately.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
