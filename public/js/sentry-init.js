/**
 * NexusCompress — Sentry Browser SDK init (requires bundle.min.js loaded first).
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

    function attachHelpers() {
        const Sentry = window.Sentry;
        if (!Sentry || window.__nexusSentryConfigured) return;

        const tool = (location.hash || '').replace(/^#/, '').trim() || 'compress';
        Sentry.setTag('app', 'nexuscompress');
        Sentry.setTag('tool', tool);

        window.NexusSentry = {
            captureException(error, context) {
                if (!window.Sentry?.getClient?.()) return;
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
                if (!window.Sentry?.getClient?.()) return;
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

    if (!initSentry()) {
        window.addEventListener('load', () => initSentry());
    }

    document.addEventListener('DOMContentLoaded', () => initSentry());
})();
