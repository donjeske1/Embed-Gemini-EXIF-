const CACHE_NAME = 'gemini-exif-pwa-v1';
const URLS_TO_CACHE_ON_INSTALL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.svg',
    '/icon-512.svg',
];

self.addEventListener('install', event => {
    self.skipWaiting(); // Activate worker immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Service Worker: Caching App Shell');
            return cache.addAll(URLS_TO_CACHE_ON_INSTALL);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache');
                        return caches.delete(cacheName);
                    }
                })
            ).then(() => self.clients.claim()) // Take control of all pages
        })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || event.request.url.includes('generativelanguage.googleapis.com')) {
        return; // Let the browser handle non-GETs and API calls
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Return cached response if found.
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Otherwise, fetch from network.
                return fetch(event.request).then(
                    networkResponse => {
                        // Clone the response and cache it.
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return networkResponse;
                    }
                ).catch(error => {
                    console.log('Fetch failed; app is offline.', error);
                });
            })
    );
});
