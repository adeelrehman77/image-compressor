#!/usr/bin/env node
/**
 * Versioning: package.json semver + per-build buildId.
 * BUMP_ON_BUILD=1 (default in npm run build) auto-increments patch on each build.
 * SKIP_VERSION_BUMP=1 skips bump (e.g. npm test).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');

function readPackage() {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function writePackage(pkg) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function getVersion() {
    return readPackage().version || '0.0.0';
}

function bumpPatchVersion() {
    const pkg = readPackage();
    const parts = String(pkg.version || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    parts[2] += 1;
    pkg.version = parts.join('.');
    writePackage(pkg);
    return pkg.version;
}

function shouldBumpOnBuild() {
    if (process.env.SKIP_VERSION_BUMP === '1') return false;
    if (process.env.BUMP_ON_BUILD === '1') return true;
    if (process.env.CI === 'true' || process.env.CI === '1') return true;
    return false;
}

/** Call at start of production build — returns active semver (bumped when enabled). */
function autoBumpForBuild() {
    if (!shouldBumpOnBuild()) return getVersion();
    const next = bumpPatchVersion();
    console.log(`version: auto-bump patch → v${next}`);
    return next;
}

function getGitShortSha() {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

/** Unique per build — used in version.json and SW cache even if semver unchanged. */
function getBuildId() {
    if (process.env.BUILD_ID) return String(process.env.BUILD_ID).replace(/[^a-zA-Z0-9._-]/g, '');
    const sha = getGitShortSha();
    if (sha) return sha;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

function swCacheId(version = getVersion(), buildId = getBuildId()) {
    const safe = String(buildId).replace(/\./g, '-');
    return `nexus-v${version}-${safe}`;
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

function writeVersionJson(targetDir, meta = {}) {
    const version = meta.version || getVersion();
    const payload = {
        version,
        buildId: meta.buildId || getBuildId(),
        builtAt: meta.builtAt || new Date().toISOString(),
    };
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'version.json'), `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
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

function syncServiceWorker(version = getVersion(), buildId = getBuildId()) {
    const swPath = path.join(root, 'public/sw.js');
    if (!fs.existsSync(swPath)) return false;
    let sw = fs.readFileSync(swPath, 'utf8');
    const cache = swCacheId(version, buildId);
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
    writePackage,
    getVersion,
    bumpPatchVersion,
    shouldBumpOnBuild,
    autoBumpForBuild,
    getBuildId,
    getGitShortSha,
    swCacheId,
    sentryRelease,
    versionBadgeEn,
    versionBadgeAr,
    writeVersionJson,
    syncJsSources,
    syncServiceWorker,
    syncHtmlVersionBadges,
};
