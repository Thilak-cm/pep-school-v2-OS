// PWA Service Worker for Montessori OS
// Dynamic cache naming based on app version
const APP_VERSION = '10.26.0'; // This will be updated with each build
const CACHE_NAME = `montessori-os-v${APP_VERSION}`;

// Files to cache on install
const CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event - cache initial files
self.addEventListener('install', (event) => {
  console.log(`[SW ${APP_VERSION}] Installing service worker...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log(`[SW ${APP_VERSION}] Caching initial files`);
        return cache.addAll(CACHE_FILES);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error(`[SW ${APP_VERSION}] Install error:`, error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log(`[SW ${APP_VERSION}] Activating service worker...`);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Delete all caches that don't match current version
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old montessori-os caches
              return cacheName.startsWith('montessori-os-v') && cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log(`[SW ${APP_VERSION}] Deleting old cache: ${cacheName}`);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        // Take control of all pages immediately
        return self.clients.claim();
      })
      .catch((error) => {
        console.error(`[SW ${APP_VERSION}] Activate error:`, error);
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first strategy for HTML (always get fresh content)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first strategy for assets (JS, CSS, images)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error(`[SW ${APP_VERSION}] Fetch error:`, error);
            throw error;
          });
      })
  );
});

// Handle skip waiting message (for immediate updates)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log(`[SW ${APP_VERSION}] Received SKIP_WAITING message`);
    self.skipWaiting();
  }
});

console.log(`[SW ${APP_VERSION}] Service worker script loaded`);

