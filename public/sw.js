const CACHE = 'nexuscompress-v3';
const ASSETS = [
    './',
    './index.html',
    './css/app.css',
    './js/app.js',
    './js/worker.js',
    './vendor/jszip.min.js',
    './manifest.json',
    './docs.html',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS).catch(() => {})));
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

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((res) => {
                if (res.ok && new URL(e.request.url).origin === self.location.origin) {
                    const clone = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, clone));
                }
                return res;
            });
        })
    );
});
