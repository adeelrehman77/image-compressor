const fs = require('fs');
const path = require('path');
const https = require('https');

const VERSION = '8.55.0';
const URL = `https://browser.sentry-cdn.com/${VERSION}/bundle.min.js`;
const destDir = path.join(__dirname, '../public/vendor');
const dest = path.join(destDir, 'sentry.bundle.min.js');

function download(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return download(res.headers.location).then(resolve).catch(reject);
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

download(URL)
    .then((buf) => {
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(dest, buf);
        console.log(`Vendored Sentry ${VERSION} → public/vendor/sentry.bundle.min.js (${buf.length} bytes)`);
    })
    .catch((err) => {
        console.error('Failed to vendor Sentry:', err.message);
        process.exit(1);
    });
