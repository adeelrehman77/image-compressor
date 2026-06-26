#!/usr/bin/env node
/**
 * Sync package.json version → version.json + JS fallbacks only.
 * HTML ?v= cache bust and data-app-version are applied in dist/ by patch-html (build.js).
 * Manual full HTML re-stamp (legacy): node scripts/sync-version.js --html
 */
const fs = require('fs');
const path = require('path');
const {
    root,
    getVersion,
    getBuildId,
    writeVersionJson,
    syncJsSources,
    syncServiceWorker,
    syncHtmlVersionBadges,
} = require('./version');
const { injectAppVersion, versionAssetUrls, injectSentry, injectGtm } = require('./patch-html');

const publicDir = path.join(root, 'public');

function walkHtml(dir, files = []) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walkHtml(p, files);
        else if (name.endsWith('.html')) files.push(p);
    }
    return files;
}

function patchPublicHtml(version) {
    let touched = 0;
    for (const file of walkHtml(publicDir)) {
        let html = fs.readFileSync(file, 'utf8');
        const before = html;
        html = injectSentry(html, file, publicDir);
        html = injectGtm(html, file, publicDir);
        html = injectAppVersion(html, version);
        html = versionAssetUrls(html, version);
        html = syncHtmlVersionBadges(html, version);
        if (html !== before) {
            fs.writeFileSync(file, html);
            touched += 1;
        }
    }
    return touched;
}

/** Release sync — small git footprint (no HTML guide churn). */
function syncReleaseAssets() {
    const version = getVersion();
    const buildId = getBuildId();
    const jsFiles = syncJsSources(version);
    writeVersionJson(publicDir, { version, buildId });
    console.log(`sync-version: ${version} · build ${buildId} (JS: ${jsFiles}, HTML: dist-only)`);
}

function main() {
    const version = getVersion();
    const buildId = getBuildId();

    if (process.argv.includes('--html')) {
        const jsFiles = syncJsSources(version);
        const sw = syncServiceWorker(version, buildId);
        const htmlFiles = patchPublicHtml(version);
        writeVersionJson(publicDir, { version, buildId });
        console.log(
            `sync-version: ${version} · build ${buildId} (JS: ${jsFiles}, HTML: ${htmlFiles}, SW: ${sw ? 'updated' : 'ok'})`
        );
        return;
    }

    syncReleaseAssets();
}

if (require.main === module) {
    main();
}

module.exports = { main, syncReleaseAssets, patchPublicHtml };
