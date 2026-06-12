#!/usr/bin/env node
/**
 * Bundle @imgly/background-removal for same-origin import (jsDelivr +esm breaks on
 * compress.funadventure.ae because its bare /npm/… imports resolve to our origin).
 * Copy model/WASM assets from @imgly/background-removal-data for same-origin fetch.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const libEntry = path.join(root, 'node_modules/@imgly/background-removal/dist/index.mjs');
const dataSrc = path.join(root, 'node_modules/@imgly/background-removal-data/dist');
const vendorDir = path.join(root, 'public/vendor');
const bundleOut = path.join(vendorDir, 'background-removal.mjs');
const dataOut = path.join(vendorDir, 'bg-removal-data');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dest, name);
        if (fs.statSync(s).isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

function dirSizeBytes(dir) {
    let total = 0;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        total += st.isDirectory() ? dirSizeBytes(p) : st.size;
    }
    return total;
}

function main() {
    if (!fs.existsSync(libEntry)) {
        console.warn('vendor-background-removal: @imgly/background-removal not installed — skip');
        return;
    }

    fs.mkdirSync(vendorDir, { recursive: true });
    esbuild.buildSync({
        entryPoints: [libEntry],
        outfile: bundleOut,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: ['es2020'],
    });
    const bundleMb = (fs.statSync(bundleOut).size / (1024 * 1024)).toFixed(2);
    console.log(`Vendored background-removal bundle → public/vendor/background-removal.mjs (${bundleMb} MB)`);

    if (!fs.existsSync(dataSrc)) {
        console.warn('vendor-background-removal: @imgly/background-removal-data not installed — skip assets');
        return;
    }

    if (fs.existsSync(dataOut)) fs.rmSync(dataOut, { recursive: true, force: true });
    copyDir(dataSrc, dataOut);

    const resources = path.join(dataOut, 'resources.json');
    if (!fs.existsSync(resources)) {
        throw new Error('vendor-background-removal: resources.json missing after copy');
    }

    const dataMb = (dirSizeBytes(dataOut) / (1024 * 1024)).toFixed(1);
    console.log(`Vendored bg-removal assets → public/vendor/bg-removal-data/ (${dataMb} MB)`);
}

try {
    main();
} catch (err) {
    console.error(err.message || err);
    process.exit(1);
}
