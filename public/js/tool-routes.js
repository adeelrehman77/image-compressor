/** Client-side tool URL helpers — keep in sync with scripts/tool-routes.js */
(function () {
    'use strict';

    var SLUG_TO_ID = {
        'images-to-pdf': 'images-to-pdf',
        'pdf-merge': 'pdf-suite',
        'svg-optimizer': 'svg',
        'passport-photo': 'passport-studio',
        'photo-checker': 'photo-checker',
        'document-redactor': 'redactor',
        'ai-upscaler': 'ai-upscaler',
        'heic-converter': 'heic-converter',
        'format-converter': 'format-converter',
        'image-cropper': 'image-cropper',
        'collage-maker': 'collage-maker',
        'remove-background': 'remove-bg',
    };

    var ID_TO_SLUG = {
        'images-to-pdf': 'images-to-pdf',
        'pdf-suite': 'pdf-merge',
        svg: 'svg-optimizer',
        'passport-studio': 'passport-photo',
        'photo-checker': 'photo-checker',
        redactor: 'document-redactor',
        'ai-upscaler': 'ai-upscaler',
        'heic-converter': 'heic-converter',
        'format-converter': 'format-converter',
        'image-cropper': 'image-cropper',
        'collage-maker': 'collage-maker',
        'remove-bg': 'remove-background',
    };

    function pathFor(toolId, locale) {
        locale = locale || window.__NEXUS_LOCALE || 'en';
        if (toolId === 'compress') return locale === 'ar' ? '/ar/' : '/';
        var slug = ID_TO_SLUG[toolId];
        if (!slug) return locale === 'ar' ? '/ar/' : '/';
        return locale === 'ar' ? '/ar/tools/' + slug + '/' : '/tools/' + slug + '/';
    }

    function parsePathname(pathname) {
        var path = (pathname || '/').replace(/\/+$/, '') || '/';
        var en = path.match(/^\/tools\/([^/]+)$/);
        if (en && SLUG_TO_ID[en[1]]) return SLUG_TO_ID[en[1]];
        var ar = path.match(/^\/ar\/tools\/([^/]+)$/);
        if (ar && SLUG_TO_ID[ar[1]]) return SLUG_TO_ID[ar[1]];
        return null;
    }

    window.__NEXUS_TOOL_ROUTES = {
        pathFor: pathFor,
        parsePathname: parsePathname,
        chipHref: function (toolId) {
            return pathFor(toolId, 'en');
        },
    };
})();
