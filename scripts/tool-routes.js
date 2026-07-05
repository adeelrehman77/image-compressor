/**
 * Crawlable URL slugs for SPA tools (compress stays on / and /ar/).
 * Pattern: /tools/{slug}/ and /ar/tools/{slug}/
 */
const { siteUrl } = require('./site-config');

const ROUTES = [
    { id: 'images-to-pdf', slug: 'images-to-pdf', priority: '0.85', changefreq: 'monthly' },
    { id: 'pdf-suite', slug: 'pdf-merge', priority: '0.85', changefreq: 'monthly' },
    { id: 'svg', slug: 'svg-optimizer', priority: '0.8', changefreq: 'monthly' },
    { id: 'passport-studio', slug: 'passport-photo', priority: '0.85', changefreq: 'monthly' },
    { id: 'photo-checker', slug: 'photo-checker', priority: '0.85', changefreq: 'weekly' },
    { id: 'redactor', slug: 'document-redactor', priority: '0.8', changefreq: 'monthly' },
    { id: 'ai-upscaler', slug: 'ai-upscaler', priority: '0.85', changefreq: 'monthly' },
    { id: 'heic-converter', slug: 'heic-converter', priority: '0.85', changefreq: 'monthly' },
    { id: 'format-converter', slug: 'format-converter', priority: '0.8', changefreq: 'monthly' },
    { id: 'image-cropper', slug: 'image-cropper', priority: '0.8', changefreq: 'monthly' },
    { id: 'collage-maker', slug: 'collage-maker', priority: '0.8', changefreq: 'monthly' },
    { id: 'remove-bg', slug: 'remove-background', priority: '0.9', changefreq: 'monthly' },
];

const SLUG_TO_ID = Object.fromEntries(ROUTES.map((r) => [r.slug, r.id]));
const ID_TO_SLUG = Object.fromEntries(ROUTES.map((r) => [r.id, r.slug]));

function pathFor(toolId, locale = 'en') {
    if (toolId === 'compress') return locale === 'ar' ? '/ar/' : '/';
    const slug = ID_TO_SLUG[toolId];
    if (!slug) return locale === 'ar' ? '/ar/' : '/';
    return locale === 'ar' ? `/ar/tools/${slug}/` : `/tools/${slug}/`;
}

function absoluteUrl(toolId, locale = 'en') {
    const base = siteUrl.replace(/\/$/, '');
    return `${base}${pathFor(toolId, locale)}`;
}

function parsePathname(pathname) {
    const path = (pathname || '/').replace(/\/+$/, '') || '/';
    const en = path.match(/^\/tools\/([^/]+)$/);
    if (en && SLUG_TO_ID[en[1]]) return SLUG_TO_ID[en[1]];
    const ar = path.match(/^\/ar\/tools\/([^/]+)$/);
    if (ar && SLUG_TO_ID[ar[1]]) return SLUG_TO_ID[ar[1]];
    return null;
}

function chipHref(toolId) {
    return pathFor(toolId, 'en');
}

module.exports = {
    ROUTES,
    SLUG_TO_ID,
    ID_TO_SLUG,
    pathFor,
    absoluteUrl,
    parsePathname,
    chipHref,
};
