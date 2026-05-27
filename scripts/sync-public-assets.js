const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

function extractFontFilesFromCss(cssPath) {
    if (!fs.existsSync(cssPath)) return [];
    const css = fs.readFileSync(cssPath, 'utf8');
    const re = /url\(\.\/files\/([^)]+\.(?:woff2|woff))\)/g;
    const files = new Set();
    let match;
    while ((match = re.exec(css)) !== null) files.add(match[1]);
    return [...files];
}

function findFontInNodeModules(filename) {
    const fontsourceDir = path.join(root, 'node_modules', '@fontsource');
    if (!fs.existsSync(fontsourceDir)) return null;
    for (const pkg of fs.readdirSync(fontsourceDir)) {
        const src = path.join(fontsourceDir, pkg, 'files', filename);
        if (fs.existsSync(src)) return src;
    }
    return null;
}

function copyFontFiles(destDir, cssPath) {
    fs.mkdirSync(destDir, { recursive: true });
    const needed = extractFontFilesFromCss(cssPath);
    let copied = 0;
    const missing = [];

    for (const file of needed) {
        const src = findFontInNodeModules(file);
        const dest = path.join(destDir, file);
        if (src) {
            fs.copyFileSync(src, dest);
            copied++;
        } else {
            missing.push(file);
        }
    }

    if (missing.length) {
        console.warn(`Warning: ${missing.length} font file(s) not found in @fontsource:`, missing.join(', '));
    }

    return copied;
}

function syncPublicAssets(versionMeta) {
    const cssPath = path.join(publicDir, 'css', 'app.css');
    const fontsDest = path.join(publicDir, 'css', 'files');
    const fontsCopied = copyFontFiles(fontsDest, cssPath);
    return { fontsCopied };
}

function syncDistAssets(distDir) {
    const cssPath = path.join(distDir, 'css', 'app.css');
    const fontsCopied = copyFontFiles(path.join(distDir, 'css', 'files'), cssPath);
    return { fontsCopied };
}

module.exports = { syncPublicAssets, syncDistAssets, copyFontFiles, extractFontFilesFromCss };

if (require.main === module) {
    const { fontsCopied } = syncPublicAssets();
    console.log(`Synced public assets → ${fontsCopied} font files`);
}
