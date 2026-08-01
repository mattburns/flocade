// Flocade service worker: precaches the entire arcade on first visit so every
// game works offline afterwards.
//
// Bump CACHE_VERSION whenever a game is added or updated — that triggers a
// fresh install which re-downloads everything listed in games.json. Between
// bumps, anything already cached is served cache-first and silently
// re-fetched in the background (stale-while-revalidate), so updates still
// flow to players one visit late.
const CACHE_VERSION = 'flocade-v1';

// Files the gallery itself needs.
const SHELL_ASSETS = [
  './',
  'css/style.css',
  'js/main.js',
  'fonts/fonts.css',
  'fonts/inter-latin.woff2',
  'fonts/press-start-2p-latin.woff2',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// Game files beyond games/<slug>/index.html (which is derived from
// games.json). A game with extra files must list them here to work offline.
const EXTRA_GAME_ASSETS = [
  'games/alive-me/three.module.min.js',
  'games/asmr/three.core.min.js',
  'games/asmr/three.module.min.js',
  'games/growing-gardens/three.module.min.js',
  'games/lego-smash/three.module.min.js',
  'games/mini-life/three.module.min.js',
  'games/my-world/three.module.min.js',
  'games/pixel-paint/oneoffs.js',
  'games/pixel-paint/pictures.js',
  'games/water-maze/three.core.min.js',
  'games/water-maze/three.module.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Fetch the registry fresh, cache it, and derive the game pages from it.
    const registryResponse = await fetch('games.json', { cache: 'no-store' });
    if (!registryResponse.ok) throw new Error(`games.json HTTP ${registryResponse.status}`);
    const games = await registryResponse.clone().json();
    await cache.put('games.json', registryResponse);

    // The gallery links to games as directory URLs (games/<slug>/), so cache
    // that form; fetches for .../index.html are normalized to it below.
    const urls = [
      ...SHELL_ASSETS,
      ...games.map((game) => `games/${game.slug}/`),
      ...EXTRA_GAME_ASSETS,
    ];
    // cache: 'no-cache' revalidates against the server, so a version bump
    // never precaches copies that are stale in the HTTP cache.
    await cache.addAll(urls.map((url) => new Request(url, { cache: 'no-cache' })));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Directory URLs and their index.html are the same document — use one cache key.
function cacheKey(request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/index.html')) {
    url.pathname = url.pathname.slice(0, -'index.html'.length);
  }
  url.search = '';
  return url.href;
}

const OFFLINE_FALLBACK = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flocade — offline</title>
<style>body{background:#0d0221;color:#00f0ff;font-family:monospace;text-align:center;padding:15vh 1.5rem}
h1{color:#ff2e88;font-size:1.4rem}a{color:#ffe600}</style></head>
<body><h1>NOT SAVED OFFLINE YET</h1>
<p>This game hasn't been downloaded to this device.<br>Open it once while online and it'll work offline forever.</p>
<p><a href="../../">&larr; back to the arcade</a></p></body></html>`;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  const key = cacheKey(request);
  const isRegistry = key === new URL('games.json', self.location.href).href;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // games.json stays network-first so new games appear immediately when
    // online (it's served with no-store semantics), with the cached copy as
    // the offline fallback.
    if (isRegistry) {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) await cache.put(key, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(key);
        if (cached) return cached;
        throw new Error('offline and games.json not cached');
      }
    }

    // Everything else: stale-while-revalidate.
    const cached = await cache.match(key);
    const network = fetch(request).then(async (response) => {
      if (response.ok) await cache.put(key, response.clone());
      return response;
    });

    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    try {
      return await network;
    } catch (error) {
      if (request.mode === 'navigate') {
        return new Response(OFFLINE_FALLBACK, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      throw error;
    }
  })());
});
