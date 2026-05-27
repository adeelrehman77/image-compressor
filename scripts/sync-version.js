#!/usr/bin/env node
/**
 * Sync package.json version → public HTML, JS, version.json, service worker.
 * Run automatically via prebuild; manual: npm run version:sync
 */
const fs = require('fs');
const path = require('path');
const {
    root,
    getVersion,
    writeVersionJson,
    syncJsSources,
    syncServiceWorker,
    syncHtmlVersionBadges,
} = require('./version');
const { patchHtmlFiles, injectAppVersion, versionAssetUrls, injectSentry, injectGtm } = require('./patch-html');

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
    for (const file of walkHtml(publicDir)) {
        let html = fs.readFileSync(file, 'utf8');
        html = injectSentry(html, file, publicDir);
        html = injectGtm(html, file, publicDir);
        html = injectAppVersion(html, version);
        html = versionAssetUrls(html, version);
        html = syncHtmlVersionBadges(html, version);
        fs.writeFileSync(file, html);
    }
}

function main() {
    const version = getVersion();
    const jsFiles = syncJsSources(version);
    const sw = syncServiceWorker(version);
    patchPublicHtml(version);
    writeVersionJson(publicDir, version);

    console.log(`sync-version: v${version} (i18n/JS: ${jsFiles} file(s), SW cache: ${sw ? 'updated' : 'ok'})`);
}

if (require.main === module) {
    main();
}

module.exports = { main, patchPublicHtml };
