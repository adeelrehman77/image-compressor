const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../node_modules/heic-to/dist/csp/heic-to.min.js');
const destDir = path.join(__dirname, '../public/vendor');
const dest = path.join(destDir, 'heic-to-csp.min.js');

if (!fs.existsSync(src)) {
    console.warn('heic-to not installed; run npm install');
    process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(2);
console.log(`Vendored heic-to (CSP build) → public/vendor/heic-to-csp.min.js (${mb} MB)`);
