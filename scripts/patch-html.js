const fs = require('fs');
const path = require('path');

const SENTRY_LOADER =
    'https://js.sentry-cdn.com/92bde2e109b37e9c307e082b3a4d0250.min.js';

function sentryInitPath(htmlFile, publicRoot) {
    const rel = path.relative(path.dirname(htmlFile), path.join(publicRoot, 'js'));
    const prefix = rel ? rel.split(path.sep).join('/') : 'js';
    return `${prefix}/sentry-init.js`;
}

function injectSentry(html, htmlFile, publicRoot) {
    const initSrc = sentryInitPath(htmlFile, publicRoot);
    const block =
        `<script src="${initSrc}"></script>\n    ` +
        `<script src="${SENTRY_LOADER}" crossorigin="anonymous"></script>`;

    if (html.includes('js.sentry-cdn.com') && html.includes('sentry-init.js')) {
        return html
            .replace(
                /<script src="https:\/\/js\.sentry-cdn\.com\/[^"]+\.min\.js" crossorigin="anonymous"><\/script>\s*<script src="[^"]*sentry-init\.js"><\/script>/i,
                block
            )
            .replace(
                /<script src="[^"]*sentry-init\.js"><\/script>\s*<script src="https:\/\/js\.sentry-cdn\.com\/[^"]+\.min\.js" crossorigin="anonymous"><\/script>/i,
                block
            );
    }

    if (html.includes('js.sentry-cdn.com')) return html;

    return html.replace(/<meta charset="UTF-8">\s*/i, `<meta charset="UTF-8">\n    ${block}\n    `);
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
