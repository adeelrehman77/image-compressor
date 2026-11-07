#!/usr/bin/env node
/**
 * Vendor face-api.js (script + TinyFaceDetector / landmark tiny weights) for CSP-safe,
 * CDN-independent Photo Checker loads.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const SCRIPT_URL =
    'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const WEIGHT_BASE =
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const WEIGHT_FILES = [
    'tiny_face_detector_model-weights_manifest.json',
    'tiny_face_detector_model-shard1',
    'face_landmark_68_tiny_model-weights_manifest.json',
    'face_landmark_68_tiny_model-shard1',
];

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'public', 'vendor');
const modelsDir = path.join(root, 'public', 'models', 'face-api');
const scriptDest = path.join(vendorDir, 'face-api.min.js');

function download(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, { headers: { 'User-Agent': 'nexuscompress-vendor' } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                    const loc = res.headers.location;
                    res.resume();
                    if (!loc) {
                        reject(new Error(`Redirect without location for ${url}`));
                        return;
                    }
                    return download(loc).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    res.resume();
                    return;
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            })
            .on('error', reject);
    });
}

async function ensureFile(url, dest, minBytes) {
    if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
        return { dest, skipped: true, bytes: fs.statSync(dest).size };
    }
    const buf = await download(url);
    if (buf.length < minBytes) {
        throw new Error(`Downloaded ${path.basename(dest)} too small (${buf.length} bytes)`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return { dest, skipped: false, bytes: buf.length };
}

(async () => {
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.mkdirSync(modelsDir, { recursive: true });

    const script = await ensureFile(SCRIPT_URL, scriptDest, 100_000);
    console.log(
        `${script.skipped ? 'OK' : 'Vendored'} face-api.min.js → public/vendor/ (${(script.bytes / 1024).toFixed(0)} KB)`
    );

    for (const name of WEIGHT_FILES) {
        const dest = path.join(modelsDir, name);
        const min = name.endsWith('.json') ? 50 : 50_000;
        const r = await ensureFile(`${WEIGHT_BASE}/${name}`, dest, min);
        console.log(
            `${r.skipped ? 'OK' : 'Vendored'} ${name} → public/models/face-api/ (${(r.bytes / 1024).toFixed(0)} KB)`
        );
    }
})().catch((err) => {
    console.error('Failed to vendor face-api:', err.message || err);
    process.exit(1);
});
