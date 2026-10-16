const CACHE_VERSION = 'design-vault-pwa-drive-video-v2';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

function scopePath() {
  try {
    const pathname = new URL(self.registration.scope).pathname;
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  } catch {
    return '/';
  }
}

function scoped(relative = '') {
  const base = scopePath();
  return `${base}${String(relative).replace(/^\//, '')}`;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const rootUrl = scoped('');
    const essentials = [rootUrl, scoped('manifest.webmanifest'), scoped('icon.svg')];
    await Promise.allSettled(essentials.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) return;
      await cache.put(url, response.clone());

      if (url === rootUrl) {
        const html = await response.text();
        const assetUrls = [...html.matchAll(/["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)]
          .map((match) => new URL(match[1], self.registration.scope).href)
          .filter((asset, index, all) => all.indexOf(asset) === index);
        await Promise.allSettled(assetUrls.map(async (asset) => {
          const assetResponse = await fetch(asset, { cache: 'reload' });
          if (assetResponse.ok) await cache.put(asset, assetResponse.clone());
        }));
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('design-vault-pwa-') && key !== RUNTIME_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(scoped(''))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    const networkPromise = fetch(request).then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    return (await networkPromise) || Response.error();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

