/** Locale bootstrap — run synchronously in <head> before paint. */
(function () {
    'use strict';

    var path = location.pathname || '/';
    var isAr = path === '/ar' || path === '/ar/' || path.indexOf('/ar/') === 0;

    window.__NEXUS_LOCALE = isAr ? 'ar' : 'en';
    window.__NEXUS_LOCALE_BASE = isAr ? '/ar' : '';
    window.__NEXUS_SITE_ROOT = isAr ? '/ar/' : '/';
    /** Prefix unused for dynamic loads (tools-shared uses root-absolute /js /vendor). Kept for legacy sync scripts. */
    window.__NEXUS_ASSET_PREFIX = path.includes('/tools/') ? '/' : isAr ? '../' : '';

    var root = document.documentElement;
    root.lang = isAr ? 'ar' : 'en';
    root.dir = isAr ? 'rtl' : 'ltr';
    root.dataset.locale = window.__NEXUS_LOCALE;
})();
