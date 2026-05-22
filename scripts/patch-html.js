const fs = require('fs');
const path = require('path');

function jsPrefix(htmlFile, publicRoot) {
    const rel = path.relative(path.dirname(htmlFile), path.join(publicRoot, 'js'));
    return rel ? rel.split(path.sep).join('/') : 'js';
}

function gtmHeadBlock(htmlFile, publicRoot) {
    const p = jsPrefix(htmlFile, publicRoot);
    return `<script src="${p}/ga-config.js" defer></script>\n    <script src="${p}/gtm.js" defer></script>`;
}

const GTM_NOSCRIPT =
    '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-K59TSM95" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>';

function stripTrackingScripts(html) {
    return html
        .replace(/<script src="[^"]*analytics\.js"[^>]*><\/script>\s*/gi, '')
        .replace(/<script src="[^"]*ga-config\.js"[^>]*><\/script>\s*/gi, '')
        .replace(/<script src="[^"]*gtm\.js"[^>]*><\/script>\s*/gi, '');
}

function injectGtm(html, htmlFile, publicRoot) {
    let next = stripTrackingScripts(html);
    if (!next.includes('gtm.js')) {
        const block = gtmHeadBlock(htmlFile, publicRoot);
        next = next.replace(/\s*<\/head>/i, `\n    ${block}\n</head>`);
    }
    if (!next.includes('googletagmanager.com/ns.html')) {
        next = next.replace(/<body([^>]*)>/i, (match, attrs) => `<body${attrs}>\n    ${GTM_NOSCRIPT}`);
    }
    return next;
}

function sentryInitPath(htmlFile, publicRoot) {
    const rel = path.relative(path.dirname(htmlFile), path.join(publicRoot, 'js'));
    const prefix = rel ? rel.split(path.sep).join('/') : 'js';
    return `${prefix}/sentry-init.js`;
}

function sentryBundlePath(htmlFile, publicRoot) {
    const rel = path.relative(path.dirname(htmlFile), path.join(publicRoot, 'vendor'));
    const prefix = rel ? rel.split(path.sep).join('/') : 'vendor';
    return `${prefix}/sentry.bundle.min.js`;
}

function sentryScriptBlock(htmlFile, publicRoot) {
    const initSrc = sentryInitPath(htmlFile, publicRoot);
    return `<script src="${initSrc}" defer></script>`;
}

function stripSentryScripts(html) {
    return html
        .replace(/<script src="https:\/\/js\.sentry-cdn\.com\/[^"]+\.min\.js" crossorigin="anonymous"><\/script>\s*/gi, '')
        .replace(/<script src="https:\/\/browser\.sentry-cdn\.com\/[^"]+\/bundle\.min\.js" crossorigin="anonymous"><\/script>\s*/gi, '')
        .replace(/<script src="[^"]*sentry\.bundle\.min\.js"[^>]*><\/script>\s*/gi, '')
        .replace(/<script src="[^"]*sentry-init\.js"[^>]*><\/script>\s*/gi, '');
}

function injectSentry(html, htmlFile, publicRoot) {
    const block = sentryScriptBlock(htmlFile, publicRoot);
    const next = stripSentryScripts(html);
    return next.replace(/<meta charset="UTF-8">\s*/i, `<meta charset="UTF-8">\n    ${block}\n    `);
}

function patchHtmlFiles(dir, publicRoot = dir) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) {
            patchHtmlFiles(p, publicRoot);
            continue;
        }
        if (!name.endsWith('.html')) continue;

        let html = fs.readFileSync(p, 'utf8');
        html = injectSentry(html, p, publicRoot);
        html = injectGtm(html, p, publicRoot);
        html = html
            .replace(/href="\.\.\/css\/styles\.css"/g, 'href="../css/app.css"')
            .replace(/href="css\/styles\.css"/g, 'href="css/app.css"')
            .replace(
                /<html lang="en" class="dark">/g,
                '<html lang="en" class="dark" data-theme="dark">'
            );

        if (!html.includes('grid-overlay') && html.includes('ambient-bg')) {
            html = html.replace(
                '<div class="ambient-bg" aria-hidden="true"></div>',
                '<div class="ambient-bg" aria-hidden="true"></div>\n    <div class="grid-overlay" aria-hidden="true"></div>'
            );
        }

        fs.writeFileSync(p, html);
    }
}

module.exports = { patchHtmlFiles };

if (require.main === module) {
    patchHtmlFiles(path.join(__dirname, '../public'));
    console.log('Patched HTML → app.css paths');
}
