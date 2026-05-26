#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function writeVersionJson(targetDir) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const payload = { version: pkg.version, builtAt: new Date().toISOString() };
    fs.writeFileSync(path.join(targetDir, 'version.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

function bumpSwCache() {
    const swPath = path.join(distDir, 'sw.js');
    if (!fs.existsSync(swPath)) return;
    let sw = fs.readFileSync(swPath, 'utf8');
    const m = sw.match(/nexuscompress-v(\d+)/);
    const next = m ? Number(m[1]) + 1 : 3;
    sw = sw.replace(/nexuscompress-v\d+/, `nexuscompress-v${next}`);
    const assets = `const ASSETS = [
    './css/app.css',
    './js/app.js',
    './js/tool-meta.js',
    './js/tools-router.js',
    './js/tools-shared.js',
    './js/worker.js',
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

console.log('Building NexusCompress…');

require('./generate-sitemap');
require('./generate-ar-index');

rimraf(distDir);
copyDir(publicDir, distDir);
writeVersionJson(publicDir);
writeVersionJson(distDir);
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
syncPublicAssets();
console.log('Copied font files → dist/css/files/ and public/css/files/');

require('./patch-html').patchHtmlFiles(distDir);

const appCss = path.join(distDir, 'css', 'app.css');
const publicAppCss = path.join(publicDir, 'css', 'app.css');
if (fs.existsSync(appCss)) {
    fs.mkdirSync(path.dirname(publicAppCss), { recursive: true });
    fs.copyFileSync(appCss, publicAppCss);
}

bumpSwCache();

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
console.log(`Done → dist/ (v${pkg.version})`);
