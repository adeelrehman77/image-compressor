const CACHE = 'nexus-v2.2.2-c2249eb';
const ASSETS = [
    './css/app.css',
    './js/app.js',
    './js/tool-meta.js',
    './js/tools-router.js',
    './js/tools-shared.js',
    './js/worker.js',
    './js/sentry-init.js',
    './js/ga-config.js',
    './js/gtm.js',
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

function isVersionedAssetRequest(url) {
    return url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
}

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // Never intercept third-party (analytics, ads, Sentry CDN, etc.)
    if (url.origin !== self.location.origin) return;

    if (isDocumentRequest(e.request) || url.pathname.endsWith('version.json')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // Network-first for JS/CSS so deploys never serve stale bundles after HTML updates.
    if (isVersionedAssetRequest(url)) {
        e.respondWith(
            fetch(e.request)
                .then((res) => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE).then((c) => c.put(e.request, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((res) => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, clone));
                }
                return res;
            });
        })
    );
});
