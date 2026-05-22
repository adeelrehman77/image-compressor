const fs = require('fs');
const path = require('path');

const candidates = [
    path.join(__dirname, '../node_modules/pdf-lib/dist/pdf-lib.min.js'),
    path.join(__dirname, '../node_modules/pdf-lib/dist/pdf-lib.esm.min.js'),
];

const src = candidates.find((p) => fs.existsSync(p));
const destDir = path.join(__dirname, '../public/vendor');
const dest = path.join(destDir, 'pdf-lib.min.js');

if (!src) {
    console.warn('pdf-lib not installed; run npm install');
    process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Vendored pdf-lib → public/vendor/pdf-lib.min.js');
