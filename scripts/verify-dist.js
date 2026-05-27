#!/usr/bin/env node
/**
 * Post-build checks — fails CI/deploy if dist/ is missing critical v2.2+ markup.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const { getVersion } = require('./version');
const pkgVersion = getVersion();

function assertFile(rel, needles) {
    const file = path.join(distDir, rel);
    if (!fs.existsSync(file)) {
        throw new Error(`verify-dist: missing ${rel}`);
    }
    const html = fs.readFileSync(file, 'utf8');
    for (const needle of needles) {
        if (!html.includes(needle)) {
            throw new Error(`verify-dist: ${rel} missing expected markup: ${needle}`);
        }
    }
}

assertFile('index.html', [
    'id="tab-image-cropper"',
    'data-pdf-tab="to-images"',
    'guides/best-image-format-uae-government-portals.html',
    'UAE portal guide',
    `data-app-version="${pkgVersion}"`,
    `id="app-version"`,
]);

const enHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
if (enHtml.includes('دليل بوابات الإمارات') && !enHtml.includes('lang="ar"')) {
    throw new Error('verify-dist: dist/index.html must not contain Arabic hero guide label');
}

const { AR_HERO_SUB } = require('./generate-ar-index');

assertFile('ar/index.html', [
    'id="tab-image-cropper"',
    'data-pdf-tab="to-images"',
    ' — اضغط الصور.',
    'فوراً. بخصوصية تامة.',
    AR_HERO_SUB,
    'دليل بوابات الإمارات',
    '../guides/uae-portal-compression-ar.html',
    '../guides/best-image-format-uae-government-portals.html',
    `data-app-version="${pkgVersion}"`,
    `v${pkgVersion}`,
]);

const arHtml = fs.readFileSync(path.join(distDir, 'ar/index.html'), 'utf8');
if (/compress images\. Instantly/i.test(arHtml) || /Shrink JPEG, PNG, WebP &amp; AVIF in your browser/i.test(arHtml)) {
    throw new Error('verify-dist: dist/ar/index.html still contains English compress hero');
}

const sw = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
const { swCacheId } = require('./version');
if (!sw.includes(`const CACHE = '${swCacheId(pkgVersion)}'`)) {
    throw new Error(`verify-dist: dist/sw.js cache must be ${swCacheId(pkgVersion)}`);
}

const worker = path.join(distDir, 'js/compress-worker.mjs');
if (!fs.existsSync(worker)) {
    throw new Error('verify-dist: missing js/compress-worker.mjs');
}

console.log(`verify-dist: OK (v${pkgVersion}) — dist/index.html & dist/ar/index.html`);
