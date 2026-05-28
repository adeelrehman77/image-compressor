/**
 * Lazy Sentry loader — stubs NexusSentry immediately, loads SDK after idle.
 */
(function () {
    const DSN =
        'https://92bde2e109b37e9c307e082b3a4d0250@o4509034368598016.ingest.us.sentry.io/4511433026699264';
    const DEFAULT_RELEASE = 'nexuscompress@2.2.29';
    const BUNDLE_SRC = 'vendor/sentry.bundle.min.js';
    const queue = [];

    function bundleUrl() {
        const prefix = window.__NEXUS_ASSET_PREFIX || '';
        return prefix + BUNDLE_SRC;
    }

    function releaseId() {
        const ver = document.getElementById('app-version')?.textContent?.trim();
        return ver ? `nexuscompress@${ver}` : DEFAULT_RELEASE;
    }

    function environment() {
        const host = location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'development';
        return 'production';
    }

    function attachHelpers() {
        const Sentry = window.Sentry;
        if (!Sentry || window.__nexusSentryConfigured) return;

        const tool = (location.hash || '').replace(/^#/, '').trim() || 'compress';
        Sentry.setTag('app', 'nexuscompress');
        Sentry.setTag('tool', tool);

        window.NexusSentry = {
            captureException(error, context) {
                if (!window.Sentry?.getClient?.()) {
                    queue.push(['exception', error, context]);
                    return;
                }
                window.Sentry.withScope((scope) => {
                    if (context && typeof context === 'object') {
                        Object.entries(context).forEach(([key, value]) => {
                            scope.setExtra(key, value);
                        });
                    }
                    const err = error instanceof Error ? error : new Error(String(error));
                    window.Sentry.captureException(err);
                });
            },
            captureMessage(message, level) {
                if (!window.Sentry?.getClient?.()) {
                    queue.push(['message', message, level]);
                    return;
                }
                window.Sentry.captureMessage(String(message), level || 'error');
            },
            setTool(toolId) {
                if (!window.Sentry?.getClient?.()) return;
                window.Sentry.setTag('tool', toolId || 'compress');
            },
            setAppVersion(version) {
                if (!window.Sentry?.getClient?.() || !version) return;
                window.Sentry.setTag('app_version', String(version));
            },
        };

        window.__nexusSentryConfigured = true;
        flushQueue();
    }

    function flushQueue() {
        if (!window.Sentry?.getClient?.()) return;
        while (queue.length) {
            const [kind, a, b] = queue.shift();
            if (kind === 'exception') window.NexusSentry.captureException(a, b);
            else window.NexusSentry.captureMessage(a, b);
        }
    }

    function initSentry() {
        const Sentry = window.Sentry;
        if (!Sentry || typeof Sentry.init !== 'function') return false;
        if (Sentry.getClient?.()) {
            attachHelpers();
            return true;
        }

        Sentry.init({
            dsn: DSN,
            sendDefaultPii: true,
            release: releaseId(),
            environment: environment(),
        });

        attachHelpers();
        return !!Sentry.getClient?.();
    }

    let bundlePromise = null;

    function loadBundle() {
        if (typeof window.Sentry !== 'undefined') return Promise.resolve();
        if (bundlePromise) return bundlePromise;
        bundlePromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-nexus-src="${BUNDLE_SRC}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', reject);
                return;
            }
            const s = document.createElement('script');
            s.src = bundleUrl();
            s.defer = true;
            s.dataset.nexusSrc = BUNDLE_SRC;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Sentry bundle failed to load'));
            document.head.appendChild(s);
        });
        return bundlePromise.then(() => initSentry());
    }

    window.NexusSentry = {
        captureException(error, context) {
            queue.push(['exception', error, context]);
            loadBundle().catch(() => {});
        },
        captureMessage(message, level) {
            queue.push(['message', message, level]);
            loadBundle().catch(() => {});
        },
        setTool() {},
        setAppVersion() {},
    };

    function scheduleLoad() {
        const run = () => loadBundle().catch(() => {});
        if ('requestIdleCallback' in window) {
            requestIdleCallback(run, { timeout: 5000 });
        } else {
            window.addEventListener('load', () => setTimeout(run, 2000));
        }
    }

    scheduleLoad();
})();
