const CACHE = 'nexuscompress-v4';
const ASSETS = [
    './css/app.css',
    './js/app.js',
    './js/worker.js',
    './js/sentry-init.js',
    './vendor/jszip.min.js',
    './vendor/sentry.bundle.min.js',
    './manifest.json',
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

function isDocumentRequest(request) {
    return (
        request.mode === 'navigate' ||
        request.destination === 'document' ||
        new URL(request.url).pathname.endsWith('.html')
    );
}

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    if (isDocumentRequest(e.request) || e.request.url.includes('version.json')) {
        e.respondWith(fetch(e.request));
        return;
    }

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
