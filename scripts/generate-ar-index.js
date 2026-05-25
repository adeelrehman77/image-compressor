#!/usr/bin/env node
/**
 * Generates public/ar/index.html from public/index.html:
 * - Asset path rewrites for /ar/
 * - Arabic meta / title / FAQ schema
 * - Baked Arabic fallback text for all data-i18n* attributes (SEO + no-JS)
 * - Default guide hrefs → Arabic guide URLs where available
 */
const fs = require('fs');
const path = require('path');
const { siteUrl } = require('./site-config');
const { loadI18n } = require('./load-i18n');
const {
    applyStaticI18n,
    patchArGuideHrefs,
    applySeoIntro,
    patchArSchema,
} = require('./apply-static-i18n');

const root = path.join(__dirname, '../public');
const src = path.join(root, 'index.html');
const outDir = path.join(root, 'ar');
const out = path.join(outDir, 'index.html');

const { ar, seoAr } = loadI18n(root);

let html = fs.readFileSync(src, 'utf8');

function up(ref) {
    return ref
        .replace(/href="css\//g, 'href="../css/')
        .replace(/href="icons\//g, 'href="../icons/')
        .replace(/href="guides\//g, 'href="../guides/')
        .replace(/href="privacy\.html"/g, 'href="../privacy.html"')
        .replace(/href="terms\.html"/g, 'href="../terms.html"')
        .replace(/href="docs\.html"/g, 'href="../docs.html"')
        .replace(/href="contact\.html"/g, 'href="../contact.html"')
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
    ar.descriptions?.compress ||
    'NexusCompress — ضاغط صور مجاني. تصغير JPEG وPNG وWebP وAVIF في متصفحك — بدون رفع، 100% خاص.';

html = html.replace(/<title>[^<]+<\/title>/, `<title>${arTitle}</title>`);
html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${arDesc.replace(/"/g, '&quot;')}">`
);
html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${arTitle.replace(/"/g, '&quot;')}">`
);
html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${arDesc.replace(/"/g, '&quot;')}">`
);
html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${arTitle.replace(/"/g, '&quot;')}">`
);
html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${arDesc.replace(/"/g, '&quot;')}">`
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

const AR_FAQ_SCHEMA = [
    {
        name: 'كيف أضغط JPEG دون فقدان الجودة؟',
        text: 'استخدم جودة بين 75% و85%. للويب، حوّل إلى WebP أو AVIF. استخدم شريط قبل/بعد في NexusCompress قبل التحميل.',
    },
    {
        name: 'هل من الآمن رفع صوري هنا؟',
        text: 'صورك لا تُرفع أبداً. المعالجة في متصفحك عبر Web Workers؛ الملفات تبقى على جهازك.',
    },
    {
        name: 'ما أفضل صيغة لتصغير حجم الصورة؟',
        text: 'WebP لمعظم المواقع، AVIF لأصغر ملف حيث مدعوم، JPEG للبريد، PNG للشفافية.',
    },
    {
        name: 'هل يمكن ضغط عدة صور دفعة واحدة؟',
        text: 'نعم. اسحب عدة ملفات أو مجلداً وحمّل النتائج كملف ZIP واحد.',
    },
    {
        name: 'هل الضغط يزيل EXIF أو موقع GPS؟',
        text: 'إعادة الترميز تزيل البيانات الوصفية بما فيها GPS. يُصحّح اتجاه EXIF تلقائياً.',
    },
    {
        name: 'هل الأداة مجانية فعلاً؟',
        text: 'نعم. الضغط مجاني بدون حساب؛ الأداة تعمل بالكامل في متصفحك.',
    },
];

const arFaqEntities = AR_FAQ_SCHEMA.map(
    (q) => `            {
              "@type": "Question",
              "name": ${JSON.stringify(q.name)},
              "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(q.text)} }
            }`
).join(',\n');

html = html.replace(
    /"@type": "FAQPage",\s*"mainEntity": \[[\s\S]*?\]\s*\}/,
    `"@type": "FAQPage",\n          "inLanguage": "ar",\n          "mainEntity": [\n${arFaqEntities}\n          ]\n        }`
);

html = patchArSchema(html);
html = applyStaticI18n(html, ar);
html = applySeoIntro(html, seoAr.compress);
html = patchArGuideHrefs(html);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, html);
console.log('Generated public/ar/index.html (Arabic static fallbacks baked)');
