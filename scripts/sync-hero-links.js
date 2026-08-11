#!/usr/bin/env node
/**
 * Enforce UAE portal guide URLs in English app HTML.
 * Canonical UAE hub: guides/uae-portal-compression (not the format comparison page).
 * Arabic hero link is baked only in generate-ar-index.js (patchArHeroGuideLink).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const EN_GUIDE = 'guides/uae-portal-compression';
const AR_GUIDE = '../guides/uae-portal-compression-ar';

function patchEnHero(html) {
    return html.replace(
        /<a\b[^>]*class="hero-callout__link hero-callout__link--muted"[^>]*>[^<]*<\/a>/,
        `<a href="${EN_GUIDE}" class="hero-callout__link hero-callout__link--muted" data-locale-href-en="${EN_GUIDE}" data-locale-href-ar="${AR_GUIDE}" data-i18n="uaeGuideLink">UAE portal guide</a>`
    );
}

function patchSeoGuideUae(html) {
    // Fix mis-linked seoGuideUae rows that still point at the format guide.
    return html.replace(
        /(<a href=")guides\/best-image-format-uae-government-portals(" data-locale-href-en=")guides\/best-image-format-uae-government-portals(" data-locale-href-ar=")\.\.\/guides\/best-image-format-uae-government-portals-ar(" data-i18n="seoGuideUae">)/g,
        `$1${EN_GUIDE}$2${EN_GUIDE}$3${AR_GUIDE}$4`
    );
}

function patchFile(filePath, { hero = false } = {}) {
    if (!fs.existsSync(filePath)) return false;
    let html = fs.readFileSync(filePath, 'utf8');
    const before = html;

    html = patchSeoGuideUae(html);
    if (hero) html = patchEnHero(html);

    if (html === before) return false;
    fs.writeFileSync(filePath, html);
    return true;
}

function main() {
    const targets = [
        { path: path.join(publicDir, 'index.html'), hero: true },
        { path: path.join(publicDir, 'contact.html'), hero: false },
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
