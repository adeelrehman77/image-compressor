const fs = require('fs');
const path = require('path');
const { siteUrl } = require('./site-config');

const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly', alternates: [{ lang: 'en', href: '/' }, { lang: 'ar-AE', href: '/ar/' }] },
    { loc: '/ar/', priority: '0.95', changefreq: 'weekly', alternates: [{ lang: 'ar-AE', href: '/ar/' }, { lang: 'en', href: '/' }] },
    { loc: '/docs.html', priority: '0.6', changefreq: 'monthly' },
    { loc: '/privacy.html', priority: '0.5', changefreq: 'yearly' },
    { loc: '/guides/index.html', priority: '0.8', changefreq: 'weekly' },
    { loc: '/guides/uae-portal-compression.html', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'en', href: '/guides/uae-portal-compression.html' }, { lang: 'ar-AE', href: '/guides/uae-portal-compression-ar.html' }] },
    { loc: '/guides/uae-portal-compression-ar.html', priority: '0.85', changefreq: 'monthly', alternates: [{ lang: 'ar-AE', href: '/guides/uae-portal-compression-ar.html' }, { lang: 'en', href: '/guides/uae-portal-compression.html' }] },
    { loc: '/guides/best-image-format-uae-government-portals.html', priority: '0.85', changefreq: 'monthly' },
    { loc: '/guides/resize-photo-uae-visa-application.html', priority: '0.85', changefreq: 'monthly' },
    { loc: '/guides/compress-image-for-mohre-portal.html', priority: '0.85', changefreq: 'monthly' },
    { loc: '/guides/jpeg-vs-webp.html', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/compress-jpeg-without-losing-quality.html', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/resize-images-for-instagram.html', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/avif-vs-webp.html', priority: '0.7', changefreq: 'monthly' },
];

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
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = pages
        .map(
            (p) => `  <url>
    <loc>${siteUrl}${p.loc}</loc>${alternateLinks(p.alternates)}
    <lastmod>${lastmod}</lastmod>
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
