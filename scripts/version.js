#!/usr/bin/env node
/**
 * Single source of truth: package.json "version".
 * Used by build, patch-html, sync-version, and verify-dist.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');

function readPackage() {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function getVersion() {
    return readPackage().version || '0.0.0';
}

function swCacheId(version = getVersion()) {
    return `nexus-v${version}`;
}

function sentryRelease(version = getVersion()) {
    return `nexuscompress@${version}`;
}

function versionBadgeEn(version = getVersion()) {
    return `v${version} — Free`;
}

function versionBadgeAr(version = getVersion()) {
    return `v${version} — مجاني`;
}

function writeVersionJson(targetDir, version = getVersion()) {
    const payload = { version, builtAt: new Date().toISOString() };
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'version.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return false;
    let text = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [pattern, replacement] of replacements) {
        const next = typeof pattern === 'string'
            ? text.split(pattern).join(replacement)
            : text.replace(pattern, replacement);
        if (next !== text) {
            text = next;
            changed = true;
        }
    }
    if (changed) fs.writeFileSync(filePath, text);
    return changed;
}

function syncJsSources(version = getVersion()) {
    const v = version;
    const files = [
        {
            path: path.join(root, 'public/js/i18n.js'),
            reps: [
                [/versionBadgeDefault: 'v[\d.]+ — Free'/, `versionBadgeDefault: '${versionBadgeEn(v)}'`],
                [/versionBadgeDefault: 'v[\d.]+ — مجاني'/, `versionBadgeDefault: '${versionBadgeAr(v)}'`],
            ],
        },
        {
            path: path.join(root, 'public/js/tools-shared.js'),
            reps: [[/\|\|\s*\n\s*'[\d.]+'/, `||\n            '${v}'`]],
        },
        {
            path: path.join(root, 'public/js/app.js'),
            reps: [[/return window\.NexusTools\?\.appVersion\?\.\(\) \|\| '[\d.]+'/, `return window.NexusTools?.appVersion?.() || '${v}'`]],
        },
        {
            path: path.join(root, 'public/js/sentry-init.js'),
            reps: [[/const DEFAULT_RELEASE = 'nexuscompress@[\d.]+'/, `const DEFAULT_RELEASE = '${sentryRelease(v)}'`]],
        },
        {
            path: path.join(root, 'public/js/guide-footer.js'),
            reps: [[/nexus-extras\.css\?v=[\d.]+/, `nexus-extras.css?v=${v}`]],
        },
    ];

    let n = 0;
    for (const { path: fp, reps } of files) {
        if (replaceInFile(fp, reps)) n += 1;
    }
    return n;
}

function syncServiceWorker(version = getVersion()) {
    const swPath = path.join(root, 'public/sw.js');
    if (!fs.existsSync(swPath)) return false;
    let sw = fs.readFileSync(swPath, 'utf8');
    const cache = swCacheId(version);
    const next = sw.replace(/const CACHE = '[^']+'/, `const CACHE = '${cache}'`);
    if (next === sw) return false;
    fs.writeFileSync(swPath, next);
    return true;
}

function syncHtmlVersionBadges(html, version = getVersion()) {
    const v = version;
    return html
        .replace(
            /(<[^>]+data-i18n="versionBadgeDefault"[^>]*>)v[\d.]+ — Free/g,
            `$1${versionBadgeEn(v)}`
        )
        .replace(
            /(<[^>]+data-i18n="versionBadgeDefault"[^>]*>)v[\d.]+ — مجاني/g,
            `$1${versionBadgeAr(v)}`
        )
        .replace(
            /(<span[^>]+id="app-version"[^>]*>)v[\d.]+(<\/span>)/g,
            `$1v${v}$2`
        );
}

module.exports = {
    root,
    pkgPath,
    readPackage,
    getVersion,
    swCacheId,
    sentryRelease,
    versionBadgeEn,
    versionBadgeAr,
    writeVersionJson,
    syncJsSources,
    syncServiceWorker,
    syncHtmlVersionBadges,
};
