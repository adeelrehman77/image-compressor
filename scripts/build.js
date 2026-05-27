#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { autoBumpForBuild, getVersion, getBuildId, writeVersionJson, swCacheId } = require('./version');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

function rimraf(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dest, name);
        if (fs.statSync(s).isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

function bumpSwCache(buildId) {
    const swPath = path.join(distDir, 'sw.js');
    if (!fs.existsSync(swPath)) return;
    const version = getVersion();
    const cache = swCacheId(version, buildId);
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace(/const CACHE = '[^']+'/, `const CACHE = '${cache}'`);
    const assets = `const ASSETS = [
    './css/app.css',
    './js/app.js',
    './js/tool-meta.js',
    './js/tools-router.js',
    './js/tools-shared.js',
    './js/worker.js',
    './js/compress-worker.mjs',
    './js/clipboard-paste.js',
    './js/tools/photo-checker.js',
    './js/tools/document-redactor.js',
    './js/compare-slider.js',
    './js/upscaler-worker.mjs',
    './js/tools/ai-upscaler.js',
    './js/sentry-init.js',
    './js/ga-config.js',
    './js/gtm.js',
    './js/ads-config.js',
    './js/ads.js',
    './js/brand-config.js',
    './js/locale.js',
    './js/i18n.js',
    './js/locale-ui.js',
    './js/guide-footer.js',
    './vendor/jszip.min.js',
    './vendor/sentry.bundle.min.js',
    './manifest.json',
];`;
    sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, assets);
    fs.writeFileSync(swPath, sw);
}

const { buildArIndex } = require('./generate-ar-index');

console.log('Building NexusCompress…');

const buildVersion = autoBumpForBuild();
const buildId = getBuildId();
console.log(`Release: v${buildVersion} · build ${buildId}`);

require('./sync-version').main();
require('./sync-hero-links').main();
require('./generate-sitemap');

// Dev preview copy (dist/ar is regenerated after patch-html below)
buildArIndex();

rimraf(distDir);
copyDir(publicDir, distDir);
const versionMeta = { version: buildVersion, buildId, builtAt: new Date().toISOString() };
writeVersionJson(publicDir, versionMeta);
writeVersionJson(distDir, versionMeta);
fs.mkdirSync(path.join(distDir, 'css'), { recursive: true });
const legacyCss = path.join(distDir, 'css', 'styles.css');
if (fs.existsSync(legacyCss)) fs.unlinkSync(legacyCss);

execSync('npx postcss src/styles/main.css -o dist/css/app.css', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
});

const { syncDistAssets, syncPublicAssets } = require('./sync-public-assets');
syncDistAssets(distDir);
writeVersionJson(publicDir, versionMeta);
writeVersionJson(distDir, versionMeta);
syncPublicAssets();
console.log('Copied font files → dist/css/files/ and public/css/files/');

require('./patch-html').patchHtmlFiles(distDir);

// Deploy truth: Arabic page generated from patched English dist (not a stale copied public/ar/)
const distAr = path.join(distDir, 'ar', 'index.html');
buildArIndex({
    src: path.join(distDir, 'index.html'),
    dest: distAr,
});
console.log(`Built deploy Arabic page → ${path.relative(root, distAr)}`);

const appCss = path.join(distDir, 'css', 'app.css');
const publicAppCss = path.join(publicDir, 'css', 'app.css');
if (fs.existsSync(appCss)) {
    fs.mkdirSync(path.dirname(publicAppCss), { recursive: true });
    fs.copyFileSync(appCss, publicAppCss);
}

bumpSwCache(buildId);

require('./verify-dist');

console.log(`Done → dist/ (v${buildVersion} · build ${buildId})`);
console.log('Deploy: npx wrangler deploy  (output: dist/)');
