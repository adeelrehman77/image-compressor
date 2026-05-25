#!/usr/bin/env node
/**
 * Generates public/ar/index.html from public/index.html with corrected asset paths.
 */
const fs = require('fs');
const path = require('path');
const { siteUrl } = require('./site-config');

const root = path.join(__dirname, '../public');
const src = path.join(root, 'index.html');
const outDir = path.join(root, 'ar');
const out = path.join(outDir, 'index.html');

let html = fs.readFileSync(src, 'utf8');

function up(ref) {
    return ref
        .replace(/href="css\//g, 'href="../css/')
        .replace(/href="icons\//g, 'href="../icons/')
        .replace(/href="guides\//g, 'href="../guides/')
        .replace(/href="privacy\.html"/g, 'href="../privacy.html"')
        .replace(/href="terms\.html"/g, 'href="../terms.html"')
        .replace(/href="docs\.html"/g, 'href="../docs.html"')
        .replace(/href="manifest\.json"/g, 'href="../manifest.json"')
        .replace(/src="js\//g, 'src="../js/');
}

html = up(html);

html = html.replace(/data-locale-href-en="guides\//g, 'data-locale-href-en="../guides/');

html = html.replace(
    /<html lang="en"([^>]*)>/,
    '<html lang="ar" dir="rtl"$1>'
);

html = html.replace(
    /content="https:\/\/compress\.funadventure\.ae\/"/g,
    `content="${siteUrl}/ar/"`
);

html = html.replace(
    /<link rel="canonical" href="https:\/\/compress\.funadventure\.ae\/">/,
    `<link rel="canonical" href="${siteUrl}/ar/">`
);

const arTitle = 'ضاغط صور مجاني | NexusCompress';
const arDesc =
    'NexusCompress — ضاغط صور مجاني. تصغير JPEG وPNG وWebP وAVIF في متصفحك — بدون رفع، 100% خاص.';
html = html.replace(/<title>[^<]+<\/title>/, `<title>${arTitle}</title>`);
html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${arDesc}">`
);
html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${arTitle}">`
);
html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${arDesc}">`
);
html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${arTitle}">`
);
html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${arDesc}">`
);
html = html.replace(
    /<meta name="keywords" content="[^"]*">/,
    '<meta name="keywords" content="ضغط صور، ضاغط صور مجاني، تصغير الصور، هوية إماراتية، ICA، ضغط JPEG، بوابات الإمارات، MOHRE">'
);

html = html.replace(
    /<meta property="og:locale" content="en_US">/,
    '<meta property="og:locale" content="ar_AE">\n    <meta property="og:locale:alternate" content="en_US">'
);

if (!html.includes('hreflang="ar-AE"')) {
    html = html.replace(
        /<link rel="canonical"/,
        `<link rel="alternate" hreflang="en" href="${siteUrl}/">\n    <link rel="alternate" hreflang="ar-AE" href="${siteUrl}/ar/">\n    <link rel="alternate" hreflang="x-default" href="${siteUrl}/">\n    <link rel="canonical"`
    );
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, html);
console.log('Generated public/ar/index.html');
