const fs = require('fs');
const path = require('path');

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
