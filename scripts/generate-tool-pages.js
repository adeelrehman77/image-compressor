#!/usr/bin/env node
/**
 * Generate crawlable /tools/{slug}/ and /ar/tools/{slug}/ entry points from patched index.html.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { ROUTES, absoluteUrl, chipHref } = require('./tool-routes');
const { loadI18n } = require('./load-i18n');
const {
    applyStaticI18n,
    patchArGuideHrefs,
    applyArCompressHero,
    patchArHeroGuideLink,
    patchArSchema,
} = require('./apply-static-i18n');

function escapeAttr(val) {
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function toRootAbsolute(html) {
    return html
        .replace(/(\s(?:href|src|content|srcset)=")(css|js|icons|vendor|models)\//g, '$1/$2/')
        .replace(/(\shref=")(manifest\.json|version\.json)"/g, '$1/$2"');
}

function replaceMeta(html, name, content, attr = 'name') {
    const re = new RegExp(`<meta ${attr}="${name}" content="[^"]*"`, 'i');
    if (re.test(html)) return html.replace(re, `<meta ${attr}="${name}" content="${escapeAttr(content)}"`);
    return html;
}

function replaceLinkCanonical(html, href) {
    if (/<link rel="canonical" href="[^"]*"/i.test(html)) {
        return html.replace(/<link rel="canonical" href="[^"]*"/i, `<link rel="canonical" href="${href}"`);
    }
    return html;
}

function replaceHreflangBlock(html, enUrl, arUrl) {
    const block = `<link rel="alternate" hreflang="en" href="${enUrl}">
    <link rel="alternate" hreflang="ar-AE" href="${arUrl}">
    <link rel="alternate" hreflang="x-default" href="${enUrl}">`;
    return html.replace(
        /<link rel="alternate" hreflang="en" href="[^"]*">\s*\n\s*<link rel="alternate" hreflang="ar(?:-AE)?" href="[^"]*">\s*\n\s*<link rel="alternate" hreflang="x-default" href="[^"]*">/i,
        block
    );
}

function patchHeadMeta(html, toolId, locale) {
    const { metaEn, metaAr } = loadI18n();
    const pack = locale === 'ar' ? metaAr : metaEn;
    const title = pack.titles?.[toolId];
    const desc = pack.descriptions?.[toolId];
    const canonical = absoluteUrl(toolId, locale);
    const enUrl = absoluteUrl(toolId, 'en');
    const arUrl = absoluteUrl(toolId, 'ar');

    let out = html;
    if (title) out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(title)}</title>`);
    if (desc) {
        out = replaceMeta(out, 'description', desc);
        out = replaceMeta(out, 'og:description', desc, 'property');
        out = replaceMeta(out, 'twitter:description', desc);
    }
    out = replaceMeta(out, 'og:url', canonical, 'property');
    if (title) {
        out = replaceMeta(out, 'og:title', title, 'property');
        out = replaceMeta(out, 'twitter:title', title);
    }
    out = replaceLinkCanonical(out, canonical);
    out = replaceHreflangBlock(out, enUrl, arUrl);
    out = out.replace(/"url": "https:\/\/compress\.funadventure\.ae\/"/g, `"url": "${canonical}"`);
    return out;
}


function loadToolTaglines() {
    try {
        const src = fs.readFileSync(path.join(__dirname, '../public/js/tool-meta.js'), 'utf8');
        const sandbox = { window: {} };
        vm.runInNewContext(src, sandbox, { filename: 'tool-meta.js' });
        return sandbox.window.__NEXUS_TOOL_META?.taglines || {};
    } catch (_) {
        return {};
    }
}

function patchToolSchema(html, toolId, locale) {
    const { metaEn, metaAr } = loadI18n();
    const pack = locale === 'ar' ? metaAr : metaEn;
    const title = pack.titles?.[toolId] || 'NexusCompress';
    const desc = pack.descriptions?.[toolId] || '';
    const canonical = absoluteUrl(toolId, locale);
    const feature = loadToolTaglines()[toolId] || desc;
    const graph = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': 'https://compress.funadventure.ae/#organization',
                'name': 'Fun Adventure Media Studio',
                'url': 'https://compress.funadventure.ae/',
                'email': 'info@funadventure.ae',
                'logo': { '@type': 'ImageObject', 'url': 'https://compress.funadventure.ae/icons/icon-512.png' },
                'sameAs': ['https://github.com/adeelrehman77/image-compressor']
            },
            {
                '@type': 'WebApplication',
                'name': 'NexusCompress',
                'url': canonical,
                'applicationCategory': 'UtilitiesApplication',
                'operatingSystem': 'Any',
                'description': desc,
                'publisher': { '@id': 'https://compress.funadventure.ae/#organization' },
                'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
                'featureList': [feature, 'Local browser processing', 'No upload for processing']
            }
        ]
    };
    const snippet = `<script type="application/ld+json">\n${JSON.stringify(graph, null, 2)}\n    </script>`;
    if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/i.test(html)) {
        return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, snippet);
    }
    return html.replace('</head>', `    ${snippet}\n</head>`);
}

function injectBootstrap(html, toolId) {
    const snippet = `<script>window.__NEXUS_INITIAL_TOOL=${JSON.stringify(toolId)};</script>`;
    if (/<script src="[^"]*tool-routes\.js/.test(html)) {
        return html.replace(/(<script src="[^"]*tool-routes\.js[^"]*"><\/script>)/i, `$1\n    ${snippet}`);
    }
    if (/<script src="[^"]*tool-meta\.js/.test(html)) {
        return html.replace(
            /(<script src="[^"]*tool-meta\.js[^"]*"><\/script>)/i,
            `$1\n    <script src="/js/tool-routes.js"></script>\n    ${snippet}`
        );
    }
    return html.replace('</head>', `    <script src="/js/tool-routes.js"></script>\n    ${snippet}\n</head>`);
}

function patchSeoToolChips(html) {
    let out = html;
    for (const route of ROUTES) {
        const hash =
            route.id === 'passport-studio'
                ? '#photo-studio'
                : route.id === 'pdf-suite'
                  ? '#pdf-suite'
                  : `#${route.id}`;
        const target = chipHref(route.id);
        out = out.replace(new RegExp(`href="${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'), `href="${target}"`);
    }
    return out;
}

function patchInitialTabState(html, toolId) {
    let out = html;
    out = out.replace(
        /(<button[^>]*id="tab-compress"[^>]*class="[^"]*)\bactive\b([^"]*"[^>]*)/i,
        '$1$2'
    );
    out = out.replace(/(<button[^>]*id="tab-compress"[^>]*)(>)/i, (m, pre, end) =>
        pre.replace(/\saria-selected="true"/i, ' aria-selected="false"') + end
    );
    out = out.replace(/(<button[^>]*id="tab-compress"[^>]*\s)tabindex="0"/i, '$1tabindex="-1"');

    const tabId = `tab-${toolId}`;
    const tabRe = new RegExp(`(<button[^>]*id="${tabId}"[^>]*class=")([^"]*)(")`, 'i');
    out = out.replace(tabRe, (m, a, cls, c) => `${a}${cls.includes('active') ? cls : cls + ' active'}${c}`);
    out = out.replace(new RegExp(`(<button[^>]*id="${tabId}"[^>]*)(>)`, 'i'), (m, pre, end) => {
        let p = pre.replace(/\saria-selected="false"/i, ' aria-selected="true"');
        if (!/aria-selected=/i.test(p)) p += ' aria-selected="true"';
        p = p.replace(/\stabindex="-1"/i, ' tabindex="0"');
        return p + end;
    });

    out = out.replace(/(<div[^>]*id="tool-panel-compress"[^>]*class=")([^"]*)(")/i, (m, a, cls, c) => {
        const next = cls.replace(/\bis-hidden\b/g, '').trim();
        return `${a}${next}${next ? ' ' : ''}is-hidden${c}`;
    });
    out = out.replace(/(<div[^>]*id="tool-panel-compress"[^>]*)(>)/i, (m, pre, end) =>
        pre.replace(/\saria-hidden="false"/i, ' aria-hidden="true"') + end
    );

    const panelId = `tool-panel-${toolId}`;
    out = out.replace(new RegExp(`(<div[^>]*id="${panelId}"[^>]*class=")([^"]*)(")`, 'i'), (m, a, cls, c) =>
        `${a}${cls.replace(/\bis-hidden\b/g, '').trim()}${c}`
    );
    out = out.replace(new RegExp(`(<div[^>]*id="${panelId}"[^>]*)(>)`, 'i'), (m, pre, end) => {
        let p = pre.replace(/\saria-hidden="true"/i, ' aria-hidden="false"');
        if (!/aria-hidden=/i.test(p)) p += ' aria-hidden="false"';
        p = p.replace(/\stabindex="-1"/i, ' tabindex="0"');
        return p + end;
    });
    return out;
}

function toArabicPage(html, arDict) {
    let out = html;
    out = out.replace(/<html lang="en"/i, '<html lang="ar" dir="rtl"');
    out = applyStaticI18n(out, arDict);
    out = patchArGuideHrefs(out);
    out = applyArCompressHero(out, arDict);
    out = patchArHeroGuideLink(out, arDict);
    out = patchArSchema(out);
    out = replaceMeta(out, 'og:locale', 'ar_AE', 'property');
    return out;
}

function writePage(outDir, relPath, html) {
    const file = path.join(outDir, relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
}

function generate({ srcIndex, outDir }) {
    if (!fs.existsSync(srcIndex)) {
        throw new Error(`generate-tool-pages: missing ${srcIndex}`);
    }
    const template = fs.readFileSync(srcIndex, 'utf8');
    const { ar: arDict } = loadI18n();

    let count = 0;
    for (const route of ROUTES) {
        let en = template;
        en = toRootAbsolute(en);
        en = patchHeadMeta(en, route.id, 'en');
        en = patchToolSchema(en, route.id, 'en');
        en = patchSeoToolChips(en);
        en = patchInitialTabState(en, route.id);
        en = injectBootstrap(en, route.id);
        writePage(outDir, `tools/${route.slug}/index.html`, en);

        let ar = toArabicPage(en, arDict);
        ar = patchHeadMeta(ar, route.id, 'ar');
        ar = patchToolSchema(ar, route.id, 'ar');
        writePage(outDir, `ar/tools/${route.slug}/index.html`, ar);
        count += 2;
    }
    console.log(`generate-tool-pages: wrote ${count} tool entry points → ${path.relative(process.cwd(), outDir)}`);
    return count;
}

if (require.main === module) {
    const root = path.join(__dirname, '..');
    const src = process.argv[2] || path.join(root, 'dist', 'index.html');
    const out = process.argv[3] || path.join(root, 'dist');
    generate({ srcIndex: src, outDir: out });
}

module.exports = { generate, patchHeadMeta, patchSeoToolChips, toRootAbsolute };
