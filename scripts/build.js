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

function bumpSwCache() {
    const swPath = path.join(distDir, 'sw.js');
    if (!fs.existsSync(swPath)) return;
    let sw = fs.readFileSync(swPath, 'utf8');
    const m = sw.match(/nexuscompress-v(\d+)/);
    const next = m ? Number(m[1]) + 1 : 3;
    sw = sw.replace(/nexuscompress-v\d+/, `nexuscompress-v${next}`);
    const assets = `const ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/app.js',
    '/js/worker.js',
    '/vendor/jszip.min.js',
    '/manifest.json',
];`;
    sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, assets);
    fs.writeFileSync(swPath, sw);
}

console.log('Building NexusCompress…');

rimraf(distDir);
copyDir(publicDir, distDir);
fs.mkdirSync(path.join(distDir, 'css'), { recursive: true });
const legacyCss = path.join(distDir, 'css', 'styles.css');
if (fs.existsSync(legacyCss)) fs.unlinkSync(legacyCss);

execSync('npx postcss src/styles/main.css -o dist/css/app.css', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
});

copyFontFiles();

function copyFontFiles() {
    const dest = path.join(distDir, 'css', 'files');
    fs.mkdirSync(dest, { recursive: true });
    const needed = [
        { pkg: 'inter', base: 'inter-latin-400-normal' },
        { pkg: 'inter', base: 'inter-latin-500-normal' },
        { pkg: 'inter', base: 'inter-latin-600-normal' },
        { pkg: 'outfit', base: 'outfit-latin-500-normal' },
        { pkg: 'outfit', base: 'outfit-latin-600-normal' },
        { pkg: 'outfit', base: 'outfit-latin-700-normal' },
    ];
    for (const { pkg, base } of needed) {
        for (const ext of ['.woff2', '.woff']) {
            const file = base + ext;
            const src = path.join(root, 'node_modules', '@fontsource', pkg, 'files', file);
            if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, file));
        }
    }
    console.log('Copied font files → dist/css/files/');
}

const indexPath = path.join(distDir, 'index.html');
for (const htmlFile of ['index.html', 'docs.html']) {
    const p = path.join(distDir, htmlFile);
    if (!fs.existsSync(p)) continue;
    let html = fs.readFileSync(p, 'utf8');
    html = html.replace(/href="css\/styles\.css"/g, 'href="css/app.css"');
    fs.writeFileSync(p, html);
}

bumpSwCache();

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(
    path.join(distDir, 'version.json'),
    JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString() }, null, 2)
);

console.log(`Done → dist/ (v${pkg.version})`);
