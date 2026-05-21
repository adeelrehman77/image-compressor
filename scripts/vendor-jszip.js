const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../node_modules/jszip/dist/jszip.min.js');
const destDir = path.join(__dirname, '../vendor');
const dest = path.join(destDir, 'jszip.min.js');

if (!fs.existsSync(src)) {
    console.warn('jszip not installed; run npm install');
    process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Vendored jszip → vendor/jszip.min.js');
