const CACHE_NAME = 'gudang-psn-wms-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/wms.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return fetch(url)
            .then((res) => {
              if (res.ok) {
                return cache.put(url, res);
              }
              console.warn('Failed to cache resource (bad response):', url);
            })
            .catch((err) => {
              console.warn('Failed to cache resource (network error):', url, err);
            });
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  // Let the browser handle standard non-GET requests, api calls, firestore, and development files
  if (
    url.includes('/api/') || 
    url.includes('firestore.googleapis.com') || 
    url.includes('@vite') || 
    url.includes('node_modules') ||
    url.includes('/src/') ||
    url.includes('vitest') ||
    url.includes('__vite_ping')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache newly requested static assets on the fly
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match('/');
      });
    })
  );
});

