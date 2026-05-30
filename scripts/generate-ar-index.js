#!/usr/bin/env node
/**
 * Generates Arabic index.html from English index.html.
 * Source of truth for structure: public/index.html
 * Deploy artifact: dist/ar/index.html (built from dist/index.html after patch-html)
 */
const fs = require('fs');
const path = require('path');
const { siteUrl } = require('./site-config');
const { loadI18n } = require('./load-i18n');
const {
    applyStaticI18n,
    patchArGuideHrefs,
    applySeoIntro,
    applyArCompressHero,
    patchArHeroGuideLink,
    patchArSchema,
} = require('./apply-static-i18n');
const { getVersion, versionBadgeAr } = require('./version');

const root = path.join(__dirname, '../public');
const defaultSrc = path.join(root, 'index.html');
const defaultOut = path.join(root, 'ar', 'index.html');

const AR_HERO_SUB =
    'صغّر JPEG وPNG وWebP وAVIF في متصفحك — لا شيء يغادر جهازك أبداً.';

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

/**
 * @param {{ src?: string, dest?: string, ar?: object, seoAr?: object }} opts
 */
function buildArIndex(opts = {}) {
    const src = opts.src || defaultSrc;
    const out = opts.dest || defaultOut;
    const i18n = loadI18n(root);
    const ar = opts.ar || i18n.ar;
    const seoAr = opts.seoAr || i18n.seoAr;

    if (!fs.existsSync(src)) {
        throw new Error(`generate-ar-index: missing source ${src}`);
    }

    let html = fs.readFileSync(src, 'utf8');

    html = up(html);
    html = html.replace(/data-locale-href-en="guides\//g, 'data-locale-href-en="../guides/');

    html = html.replace(/<html lang="en"([^>]*)>/, '<html lang="ar" dir="rtl"$1>');

    html = html.replace(/content="https:\/\/compress\.funadventure\.ae\/"/g, `content="${siteUrl}/ar/"`);

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

    const arHero = { ...ar, heroSubCompress: AR_HERO_SUB };
    html = applyArCompressHero(html, arHero);
    html = patchArGuideHrefs(html);
    html = patchArHeroGuideLink(html, ar);

    const ver = getVersion();
    html = html.replace(/data-app-version="[^"]*"/g, `data-app-version="${ver}"`);
    html = html.replace(
        /(<span class="compress-hero__badge" id="compress-version-badge" data-i18n="versionBadgeDefault">)[^<]+(<\/span>)/,
        `$1${versionBadgeAr(ver)}$2`
    );

    // Fail build if English compress hero leaked into Arabic output
    if (/compress images\. Instantly/i.test(html) || /Shrink JPEG, PNG, WebP/i.test(html)) {
        throw new Error(
            'generate-ar-index: Arabic page still contains English compress hero — check applyArCompressHero regex'
        );
    }
    if (!html.includes('اضغط الصور') || !html.includes(AR_HERO_SUB)) {
        throw new Error('generate-ar-index: Arabic hero H1/subtitle missing from output');
    }
    if (!html.includes('id="tab-image-cropper"')) {
        throw new Error('generate-ar-index: Image Cropper tab missing — English source must include static nav link');
    }
    if (!html.includes('id="tab-collage-maker"')) {
        throw new Error('generate-ar-index: Collage Maker tab missing — English source must include static nav link');
    }

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    return out;
}

module.exports = { buildArIndex, AR_HERO_SUB };

if (require.main === module) {
    buildArIndex();
    console.log(`Generated ${defaultOut} (Arabic static fallbacks baked)`);
}
