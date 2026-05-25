#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

const themeMeta = `    <meta name="theme-color" content="#0B0C10" media="(prefers-color-scheme: dark)">
    <meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)">`;

const guideHeader = `    <header class="site-header">
        <div class="site-header-inner">
            <a href="../" class="site-logo">
                <span class="logo-dot" aria-hidden="true"></span>
                <span class="site-logo-text">
                    <span class="site-logo-name site-logo-name--brand">NexusCompress</span>
                    <span class="site-logo-tag">Guides</span>
                </span>
            </a>
            <div class="site-header-meta">
                <a href="../" class="chip chip-success">← NexusCompress</a>
                <a href="../privacy.html" class="chip chip-muted">Privacy Policy</a>
            </div>
        </div>
    </header>`;

const guideFooter = `    <footer class="site-footer">
        <p>© <span id="footer-year"></span> NexusCompress · <a href="../">Compressor</a> · <a href="index.html">Guides</a> · <a href="../privacy.html">Privacy Policy</a> · <a href="../docs.html">Docs</a></p>
    </footer>`;

const rootHeader = (tag) => `    <header class="site-header">
        <div class="site-header-inner">
            <a href="./" class="site-logo">
                <span class="logo-dot" aria-hidden="true"></span>
                <span class="site-logo-text">
                    <span class="site-logo-name site-logo-name--brand">NexusCompress</span>
                    <span class="site-logo-tag">${tag}</span>
                </span>
            </a>
            <div class="site-header-meta">
                <a href="./" class="chip chip-success">← NexusCompress</a>
                <a href="guides/index.html" class="chip chip-muted">Guides</a>
            </div>
        </div>
    </header>`;

const rootFooter = `    <footer class="site-footer">
        <p>© <span id="footer-year"></span> NexusCompress · <a href="./">Compressor</a> · <a href="guides/index.html">Guides</a> · <a href="privacy.html">Privacy Policy</a> · <a href="docs.html">Docs</a></p>
    </footer>`;

function patchGuide(file) {
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/<html lang="en" class="dark">/, '<html lang="en" class="dark" data-theme="dark">');
    html = html.replace(/href="\.\.\/css\/styles\.css"/, 'href="../css/app.css"');
    if (!html.includes('theme-color')) {
        html = html.replace(
            /<meta name="viewport"[^>]+>/,
            (m) => `${m}\n${themeMeta}`
        );
    }
    if (!html.includes('grid-overlay')) {
        html = html.replace(
            '<div class="ambient-bg" aria-hidden="true"></div>',
            '<div class="ambient-bg" aria-hidden="true"></div>\n    <div class="grid-overlay" aria-hidden="true"></div>'
        );
    }
    html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, guideHeader);
    html = html.replace(
        /<footer class="site-footer">[\s\S]*?<\/footer>/,
        guideFooter
    );
    fs.writeFileSync(file, html);
}

function patchRootSubpage(file, tag, articleClass) {
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/<html lang="en" class="dark">/, '<html lang="en" class="dark" data-theme="dark">');
    html = html.replace(/href="css\/styles\.css"/, 'href="css/app.css"');
    if (!html.includes('theme-color')) {
        html = html.replace(
            /<meta name="viewport"[^>]+>/,
            (m) => `${m}\n${themeMeta}`
        );
    }
    if (!html.includes('grid-overlay')) {
        html = html.replace(
            '<div class="ambient-bg" aria-hidden="true"></div>',
            '<div class="ambient-bg" aria-hidden="true"></div>\n    <div class="grid-overlay" aria-hidden="true"></div>'
        );
    }
    if (html.includes('<header class="site-header">')) {
        html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, rootHeader(tag));
    } else {
        html = html.replace(
            '<div class="grid-overlay" aria-hidden="true"></div>',
            `<div class="grid-overlay" aria-hidden="true"></div>\n\n${rootHeader(tag)}`
        );
    }
    if (articleClass && html.includes('docs-page')) {
        html = html.replace(
            '<article class="docs-page glass-panel">',
            '<article class="guide-page docs-page max-width-wrap glass-panel">'
        );
    }
    if (!html.includes('site-footer')) {
        html = html.replace('</body>', `${rootFooter}\n    <script src="js/guide-footer.js"></script>\n</body>`);
    } else {
        html = html.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, rootFooter);
        if (!html.includes('guide-footer.js')) {
            html = html.replace('</body>', '    <script src="js/guide-footer.js"></script>\n</body>');
        }
    }
    fs.writeFileSync(file, html);
}

const guidesDir = path.join(publicDir, 'guides');
for (const name of fs.readdirSync(guidesDir)) {
    if (name.endsWith('.html')) patchGuide(path.join(guidesDir, name));
}

patchRootSubpage(path.join(publicDir, 'docs.html'), 'Documentation', true);

console.log('Normalized guide and docs pages');
