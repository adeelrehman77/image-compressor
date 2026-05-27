#!/usr/bin/env node
/**
 * Enforce UAE portal guide URLs in English app HTML.
 * Arabic hero link is baked only in generate-ar-index.js (patchArHeroGuideLink).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const EN_GUIDE = 'guides/best-image-format-uae-government-portals.html';
const AR_GUIDE = '../guides/uae-portal-compression-ar.html';

function patchEnHero(html) {
    return html.replace(
        /<a\b[^>]*class="hero-callout__link hero-callout__link--muted"[^>]*>[^<]*<\/a>/,
        `<a href="${EN_GUIDE}" class="hero-callout__link hero-callout__link--muted" data-locale-href-en="${EN_GUIDE}" data-locale-href-ar="${AR_GUIDE}" data-i18n="uaeGuideLink">UAE portal guide</a>`
    );
}

function patchFile(filePath, { hero = false } = {}) {
    if (!fs.existsSync(filePath)) return false;
    let html = fs.readFileSync(filePath, 'utf8');
    const before = html;

    html = html.replace(/guides\/uae-portal-compression\.html/g, EN_GUIDE);
    if (hero) html = patchEnHero(html);

    if (html === before) return false;
    fs.writeFileSync(filePath, html);
    return true;
}

function main() {
    const targets = [
        { path: path.join(publicDir, 'index.html'), hero: true },
        { path: path.join(publicDir, 'contact.html'), hero: false },
        { path: path.join(publicDir, 'guides/compress-image-for-mohre-portal.html'), hero: false },
        { path: path.join(publicDir, 'guides/resize-photo-uae-visa-application.html'), hero: false },
    ];
    let n = 0;
    for (const t of targets) {
        if (patchFile(t.path, { hero: t.hero })) n += 1;
    }
    console.log(`sync-hero-links: patched ${n} English file(s)`);
}

if (require.main === module) {
    main();
}

module.exports = { main, patchFile, patchEnHero, EN_GUIDE, AR_GUIDE };
