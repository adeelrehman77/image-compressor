const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const FONT_FILES = [
    { pkg: 'inter', base: 'inter-latin-400-normal' },
    { pkg: 'inter', base: 'inter-latin-500-normal' },
    { pkg: 'inter', base: 'inter-latin-600-normal' },
    { pkg: 'outfit', base: 'outfit-latin-500-normal' },
    { pkg: 'outfit', base: 'outfit-latin-600-normal' },
    { pkg: 'outfit', base: 'outfit-latin-700-normal' },
];

function copyFontFiles(destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    let copied = 0;
    for (const { pkg, base } of FONT_FILES) {
        for (const ext of ['.woff2', '.woff']) {
            const file = base + ext;
            const src = path.join(root, 'node_modules', '@fontsource', pkg, 'files', file);
            const dest = path.join(destDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                copied++;
            }
        }
    }
    return copied;
}

function writeVersionJson(destPath) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    fs.writeFileSync(
        destPath,
        JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString() }, null, 2)
    );
    return pkg.version;
}

function syncPublicAssets() {
    const fontsDest = path.join(publicDir, 'css', 'files');
    const fontsCopied = copyFontFiles(fontsDest);
    const version = writeVersionJson(path.join(publicDir, 'version.json'));
    return { fontsCopied, version };
}

function syncDistAssets(distDir) {
    const fontsCopied = copyFontFiles(path.join(distDir, 'css', 'files'));
    const version = writeVersionJson(path.join(distDir, 'version.json'));
    return { fontsCopied, version };
}

module.exports = { syncPublicAssets, syncDistAssets, copyFontFiles, writeVersionJson };

if (require.main === module) {
    const { fontsCopied, version } = syncPublicAssets();
    console.log(`Synced public assets → ${fontsCopied} font files, version ${version}`);
}
