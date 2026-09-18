/**
 * Shared filters for Puppeteer CI tests — ignore third-party telemetry / CDN noise.
 * Keep failing on real application errors.
 */
'use strict';

const IGNORED_EXTERNAL_HOSTS = [
    'cloudflareinsights.com',
    'static.cloudflareinsights.com',
    'google.com',
    'google-analytics.com',
    'analytics.google.com',
    'googletagmanager.com',
    'googleadservices.com',
    'googlesyndication.com',
    'doubleclick.net',
    'cdn.jsdelivr.net',
    'sentry.io',
    'browser.sentry-cdn.com',
    'js.sentry-cdn.com',
];

const IGNORED_CONSOLE_PATTERNS = [
    // Chromium often logs this without a URL; host filter covers named third parties.
    /Failed to load resource/i,
    /\.woff2?\b/i,
];

function isIgnoredExternal(text) {
    if (!text) return false;
    const s = String(text);
    if (IGNORED_EXTERNAL_HOSTS.some((host) => s.includes(host))) return true;
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(s))) return true;
    return false;
}

module.exports = {
    IGNORED_EXTERNAL_HOSTS,
    isIgnoredExternal,
};
