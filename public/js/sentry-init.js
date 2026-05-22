/**
 * NexusCompress — Sentry (loader + explicit init).
 * Loader must run after this file so window.sentryOnLoad is registered first.
 */
(function () {
    const DSN =
        'https://92bde2e109b37e9c307e082b3a4d0250@o4509034368598016.ingest.us.sentry.io/4511433026699264';
    const DEFAULT_RELEASE = 'nexuscompress@2.1.0';

    function releaseId() {
        const ver = document.getElementById('app-version')?.textContent?.trim();
        return ver ? `nexuscompress@${ver}` : DEFAULT_RELEASE;
    }

    function environment() {
        const host = location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return 'development';
        return 'production';
    }

    function attachHelpers(Sentry) {
        if (!Sentry || window.__nexusSentryConfigured) return;
        window.__nexusSentryConfigured = true;

        const tool = (location.hash || '').replace(/^#/, '').trim() || 'compress';
        Sentry.setTag('app', 'nexuscompress');
        Sentry.setTag('tool', tool);

        window.NexusSentry = {
            captureException(error, context) {
                if (!window.Sentry) return;
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
                if (!window.Sentry) return;
                window.Sentry.captureMessage(String(message), level || 'error');
            },
            setTool(toolId) {
                if (!window.Sentry) return;
                window.Sentry.setTag('tool', toolId || 'compress');
            },
        };
    }

    window.sentryOnLoad = function () {
        Sentry.init({
            dsn: DSN,
            sendDefaultPii: true,
            release: releaseId(),
            environment: environment(),
        });
        attachHelpers(Sentry);
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof Sentry === 'undefined' || !window.__nexusSentryConfigured) return;
        Sentry.setRelease(releaseId());
    });
})();
