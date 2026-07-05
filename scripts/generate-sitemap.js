const fs = require('fs');
const path = require('path');
const { siteUrl } = require('./site-config');
const { locToSourceFile } = require('./public-url');
const { ROUTES } = require('./tool-routes');

const publicDir = path.join(__dirname, '../public');

const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly', alternates: [{ lang: 'en', href: '/' }, { lang: 'ar-AE', href: '/ar/' }] },
    { loc: '/ar/', priority: '0.95', changefreq: 'weekly', alternates: [{ lang: 'ar-AE', href: '/ar/' }, { lang: 'en', href: '/' }] },
    { loc: '/docs', priority: '0.6', changefreq: 'monthly' },
    { loc: '/privacy', priority: '0.5', changefreq: 'yearly' },
    { loc: '/terms', priority: '0.5', changefreq: 'yearly' },
    { loc: '/contact', priority: '0.5', changefreq: 'yearly' },
    { loc: '/guides/', priority: '0.8', changefreq: 'weekly' },
    { loc: '/guides/uae-portal-compression', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/uae-portal-compression' }, { lang: 'ar-AE', href: '/guides/uae-portal-compression-ar' }] },
    { loc: '/guides/uae-portal-compression-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/uae-portal-compression-ar' }, { lang: 'en', href: '/guides/uae-portal-compression' }] },
    { loc: '/guides/best-image-format-uae-government-portals', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/best-image-format-uae-government-portals' }, { lang: 'ar-AE', href: '/guides/best-image-format-uae-government-portals-ar' }] },
    { loc: '/guides/best-image-format-uae-government-portals-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/best-image-format-uae-government-portals-ar' }, { lang: 'en', href: '/guides/best-image-format-uae-government-portals' }] },
    { loc: '/guides/resize-photo-uae-visa-application', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/resize-photo-uae-visa-application' }, { lang: 'ar-AE', href: '/guides/resize-photo-uae-visa-application-ar' }] },
    { loc: '/guides/resize-photo-uae-visa-application-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/resize-photo-uae-visa-application-ar' }, { lang: 'en', href: '/guides/resize-photo-uae-visa-application' }] },
    { loc: '/guides/compress-image-for-mohre-portal', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/compress-image-for-mohre-portal' }, { lang: 'ar-AE', href: '/guides/compress-image-for-mohre-portal-ar' }] },
    { loc: '/guides/compress-image-for-mohre-portal-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/compress-image-for-mohre-portal-ar' }, { lang: 'en', href: '/guides/compress-image-for-mohre-portal' }] },
    { loc: '/guides/nexuscompress-image-compressor-faq', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/nexuscompress-image-compressor-faq' }, { lang: 'ar-AE', href: '/guides/nexuscompress-image-compressor-faq-ar' }] },
    { loc: '/guides/nexuscompress-image-compressor-faq-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/nexuscompress-image-compressor-faq-ar' }, { lang: 'en', href: '/guides/nexuscompress-image-compressor-faq' }] },
    { loc: '/guides/uae-photo-compliance-checker', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/uae-photo-compliance-checker' }, { lang: 'ar-AE', href: '/guides/uae-photo-compliance-checker-ar' }] },
    { loc: '/guides/uae-photo-compliance-checker-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/uae-photo-compliance-checker-ar' }, { lang: 'en', href: '/guides/uae-photo-compliance-checker' }] },
    { loc: '/guides/redact-emirates-id-documents', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/redact-emirates-id-documents' }, { lang: 'ar-AE', href: '/guides/redact-emirates-id-documents-ar' }] },
    { loc: '/guides/redact-emirates-id-documents-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/redact-emirates-id-documents-ar' }, { lang: 'en', href: '/guides/redact-emirates-id-documents' }] },
    { loc: '/guides/ai-image-upscaler-browser', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/ai-image-upscaler-browser' }, { lang: 'ar-AE', href: '/guides/ai-image-upscaler-browser-ar' }] },
    { loc: '/guides/ai-image-upscaler-browser-ar', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/ai-image-upscaler-browser-ar' }, { lang: 'en', href: '/guides/ai-image-upscaler-browser' }] },
    { loc: '/guides/compress-image-for-whatsapp', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/reduce-image-size-email-attachments', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/compress-images-real-estate-listings', priority: '0.8', changefreq: 'monthly' },
    { loc: '/guides/resize-photo-linkedin-profile', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/reduce-image-size-for-wordpress', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/compress-png-without-losing-transparency', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/jpeg-vs-webp', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/compress-jpeg-without-losing-quality', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/resize-images-for-instagram', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/avif-vs-webp', priority: '0.7', changefreq: 'monthly' },
    ...ROUTES.flatMap((route) => [
        {
            loc: `/tools/${route.slug}/`,
            priority: route.priority,
            changefreq: route.changefreq,
            alternates: [
                { lang: 'en', href: `/tools/${route.slug}/` },
                { lang: 'ar-AE', href: `/ar/tools/${route.slug}/` },
            ],
        },
        {
            loc: `/ar/tools/${route.slug}/`,
            priority: route.priority,
            changefreq: route.changefreq,
            alternates: [
                { lang: 'ar-AE', href: `/ar/tools/${route.slug}/` },
                { lang: 'en', href: `/tools/${route.slug}/` },
            ],
        },
    ]),
];

function lastmodForLoc(loc) {
    if (loc.startsWith('/tools/') || loc.startsWith('/ar/tools/')) {
        return fs.statSync(path.join(publicDir, 'index.html')).mtime.toISOString().slice(0, 10);
    }
    const file = locToSourceFile(loc, publicDir);
    if (!fs.existsSync(file)) {
        return new Date().toISOString().slice(0, 10);
    }
    return fs.statSync(file).mtime.toISOString().slice(0, 10);
}

function alternateLinks(alternates) {
    if (!alternates || !alternates.length) return '';
    return alternates
        .map(
            (a) =>
                `\n    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${siteUrl}${a.href}" />`
        )
        .join('');
}

function generate() {
    const urls = pages
        .map(
            (p) => `  <url>
    <loc>${siteUrl}${p.loc}</loc>${alternateLinks(p.alternates)}
    <lastmod>${lastmodForLoc(p.loc)}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
        )
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

const out = path.join(__dirname, '../public/sitemap.xml');
fs.writeFileSync(out, generate());
console.log('Generated public/sitemap.xml');
