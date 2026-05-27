#!/usr/bin/env node
/**
 * Post-build checks — fails CI/deploy if dist/ is missing critical v2.2+ markup.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

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
    `data-app-version="${pkg.version}"`,
]);

assertFile('ar/index.html', [
    'id="tab-image-cropper"',
    'data-pdf-tab="to-images"',
    ' — اضغط الصور.',
    'دليل بوابات الإمارات',
    '../guides/uae-portal-compression-ar.html',
    `data-app-version="${pkg.version}"`,
]);

const worker = path.join(distDir, 'js/compress-worker.mjs');
if (!fs.existsSync(worker)) {
    throw new Error('verify-dist: missing js/compress-worker.mjs');
}

console.log(`verify-dist: OK (v${pkg.version}) — dist/index.html & dist/ar/index.html`);
