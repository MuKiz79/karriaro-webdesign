/* Karriaro Mobile — Service-Worker Sprint 148 (Premium-Vitrine-Refresh).
   Strategien:
   - HTML (navigate-requests): network-first → cache-fallback → offline.html
   - CSS/JS/Images: stale-while-revalidate (fast first-paint + Background-Refresh)
   - Icons + manifest: cache-first (statisch)

   Cache-Version-Konvention: bei jedem mobile-overrides.css- oder
   m-interactions.js-Update muss CACHE-Konstante mit der ?v=-Version
   synchron gehen, sonst serviert der SW alten gecachten Stand
   stale-while-revalidate und der User sieht erst die alte Version,
   dann die neue (siehe Sprint-148-Befund "andere Sicht zuerst").
*/

const CACHE = 'karriaro-mobile-v152';
const OFFLINE_URL = '/offline.html';
const SHELL = [
    '/',
    '/offline.html',
    '/css/mobile.css',
    '/css/mobile-overrides.css?v=149',
    '/css/tokens.css',
    '/js/m-interactions.js?v=149',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(SHELL).catch(() => {
                // Falls einzelner SHELL-Asset fehlt, individuell adden statt komplett failen
                return Promise.all(SHELL.map((url) =>
                    c.add(url).catch(() => null)
                ));
            }))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Hilfs-Strategie: stale-while-revalidate
function staleWhileRevalidate(request) {
    return caches.open(CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((res) => {
                if (res && res.status === 200) {
                    cache.put(request, res.clone()).catch(() => {});
                }
                return res;
            }).catch(() => cached);
            return cached || fetchPromise;
        });
    });
}

// Hilfs-Strategie: network-first mit Offline-Fallback
function networkFirstWithOfflineFallback(request) {
    return fetch(request)
        .then((res) => {
            if (res && res.status === 200) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
        })
        .catch(() => {
            return caches.match(request).then((cached) => {
                return cached || caches.match(OFFLINE_URL);
            });
        });
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Nur same-origin handlen (kein 3rd-party)
    if (url.origin !== location.origin) return;

    // HTML navigate-requests → network-first + Offline-Fallback
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        e.respondWith(networkFirstWithOfflineFallback(req));
        return;
    }
    // CSS/JS/Images → stale-while-revalidate
    if (/\.(css|js|webp|jpg|jpeg|png|svg|woff2?)$/i.test(url.pathname)) {
        e.respondWith(staleWhileRevalidate(req));
        return;
    }
    // Default: network mit Cache-Fallback
    e.respondWith(fetch(req).catch(() => caches.match(req)));
});
