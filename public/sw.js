const CACHE = 'nexus-v2.2.22-cdbe142';
const FACE_MODEL_CACHE = 'nexus-face-models-v1';
const UPSCALER_MODEL_CACHE = 'nexus-esrgan-model-v1';

function isFaceApiCdnRequest(url) {
    return (
        url.hostname === 'cdn.jsdelivr.net' &&
        (url.pathname.includes('/face-api.js@') || url.pathname.includes('/@vladmandic/face-api/model/'))
    );
}

function isUpscalerCdnRequest(url) {
    return (
        url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/onnxruntime-web@')
    );
}

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

    if (isFaceApiCdnRequest(url)) {
        e.respondWith(
            caches.open(FACE_MODEL_CACHE).then((cache) =>
                cache.match(e.request).then(
                    (cached) =>
                        cached ||
                        fetch(e.request).then((res) => {
                            if (res.ok) cache.put(e.request, res.clone());
                            return res;
                        })
                )
            )
        );
        return;
    }

    if (isUpscalerCdnRequest(url)) {
        e.respondWith(
            caches.open(UPSCALER_MODEL_CACHE).then((cache) =>
                cache.match(e.request).then(
                    (cached) =>
                        cached ||
                        fetch(e.request).then((res) => {
                            if (res.ok) cache.put(e.request, res.clone());
                            return res;
                        })
                )
            )
        );
        return;
    }

    // Never intercept other third-party (analytics, ads, Sentry CDN, etc.)
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
