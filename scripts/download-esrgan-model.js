#!/usr/bin/env node
/**
 * Fetches the Real-ESRGAN ONNX model into public/models/ for same-origin loading.
 * Source: Qualcomm AI Hub export (128×128 in, 4× out, ~4.9 MB) — public on Hugging Face.
 * Xenova/real-esrgan-x4 returns HTTP 401 for anonymous browser/CDN fetches (2026).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUT = path.join(__dirname, '../public/models/realesrgan-x4.onnx');
const URL =
    'https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3/resolve/adf5ce5bb0b8b1b2e17780cba799dc7d9b7434fd/Real-ESRGAN-General-x4v3.onnx';
const MIN_BYTES = 4_000_000;

function main() {
    if (fs.existsSync(OUT) && fs.statSync(OUT).size >= MIN_BYTES) {
        console.log(`esrgan model: OK (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
        return;
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    console.log('esrgan model: downloading…');
    execSync(`curl -fsSL "${URL}" -o "${OUT}"`, { stdio: 'inherit' });
    const size = fs.statSync(OUT).size;
    if (size < MIN_BYTES) {
        fs.unlinkSync(OUT);
        throw new Error(`download-esrgan-model: file too small (${size} bytes)`);
    }
    console.log(`esrgan model: saved ${(size / 1e6).toFixed(2)} MB → public/models/realesrgan-x4.onnx`);
}

try {
    main();
} catch (err) {
    console.error(err.message || err);
    process.exit(1);
}
