const fs = require('fs');
const path = require('path');
const { siteUrl } = require('./site-config');

const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/docs.html', priority: '0.6', changefreq: 'monthly' },
    { loc: '/privacy.html', priority: '0.5', changefreq: 'yearly' },
    { loc: '/guides/index.html', priority: '0.8', changefreq: 'weekly' },
    { loc: '/guides/jpeg-vs-webp.html', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/compress-jpeg-without-losing-quality.html', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/resize-images-for-instagram.html', priority: '0.75', changefreq: 'monthly' },
    { loc: '/guides/avif-vs-webp.html', priority: '0.7', changefreq: 'monthly' },
];

function generate() {
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = pages
        .map(
            (p) => `  <url>
    <loc>${siteUrl}${p.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
        )
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

const out = path.join(__dirname, '../public/sitemap.xml');
fs.writeFileSync(out, generate());
console.log('Generated public/sitemap.xml');
