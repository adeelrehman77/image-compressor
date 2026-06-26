#!/usr/bin/env node
/**
 * Print SHA-256 certificate fingerprint(s) for Digital Asset Links.
 *
 * Usage:
 *   node scripts/android-fingerprint.js [path-to.keystore] [alias]
 *   KEYSTORE_PASS=secret node scripts/android-fingerprint.js android/android.keystore nexuscompress
 *
 * After copying the RELEASE fingerprint into public/.well-known/assetlinks.json,
 * run npm run build and deploy dist/ so compress.funadventure.ae serves the file.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const keystore = process.argv[2] || path.join(root, 'android', 'android.keystore');
const alias = process.argv[3] || 'nexuscompress';
const storePass = process.env.KEYSTORE_PASS || process.env.STORE_PASS;

if (!fs.existsSync(keystore)) {
    console.error(`Keystore not found: ${keystore}`);
    console.error('Generate one with Bubblewrap init, or:');
    console.error(
        '  keytool -genkeypair -v -keystore android/android.keystore -alias nexuscompress -keyalg RSA -keysize 2048 -validity 10000'
    );
    process.exit(1);
}

const passArg = storePass ? `-storepass ${JSON.stringify(storePass)}` : '';
let out;
try {
    out = execSync(
        `keytool -list -v -keystore ${JSON.stringify(keystore)} -alias ${JSON.stringify(alias)} ${passArg}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
} catch (err) {
    if (!storePass) {
        console.error('keytool failed (keystore may need a password). Set KEYSTORE_PASS and retry.');
    }
    console.error(err.stderr || err.message);
    process.exit(1);
}

const match = out.match(/SHA256:\s*([0-9A-F:]+)/i);
if (!match) {
    console.error('Could not parse SHA256 from keytool output.');
    process.exit(1);
}

const fingerprint = match[1].toUpperCase();
console.log('\nSHA-256 (colon-separated, for assetlinks.json):');
console.log(fingerprint);
console.log('\nPaste into public/.well-known/assetlinks.json → sha256_cert_fingerprints');
console.log('Verify live: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://compress.funadventure.ae&relation=delegate_permission/common.handle_all_urls');
