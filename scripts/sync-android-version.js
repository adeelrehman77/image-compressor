#!/usr/bin/env node
/**
 * Sync Android versionCode / versionName before Bubblewrap release builds.
 *
 * - versionName ← package.json (YYYYMMDD.HHmm UTC)
 * - versionCode ← previous + 1 (must fit Android int32; date string is NOT used as code)
 * - manifest-checksum.txt ← sha1(twa-manifest.json) so bubblewrap build skips prompts
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getVersion } = require('./version');

const root = path.join(__dirname, '..');
const twaPath = path.join(root, 'android/twa-manifest.json');
const checksumPath = path.join(root, 'android/manifest-checksum.txt');
const gradlePath = path.join(root, 'android/app/build.gradle');

const MAX_VERSION_CODE = 2147483647;

function updateManifestChecksum() {
    if (!fs.existsSync(twaPath)) return;
    const checksum = crypto.createHash('sha1').update(fs.readFileSync(twaPath)).digest('hex');
    // Bubblewrap compares checksums with != and does not trim — no trailing newline.
    fs.writeFileSync(checksumPath, checksum);
}

function patchGradle(versionCode, versionName) {
    if (!fs.existsSync(gradlePath)) {
        console.warn('sync-android-version: android/app/build.gradle not found — run bubblewrap init first');
        return false;
    }
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    const hasCode = /versionCode\s+\d+/.test(gradle);
    const hasName = /versionName\s+"[^"]*"/.test(gradle);
    if (!hasCode || !hasName) {
        throw new Error('sync-android-version: could not find versionCode/versionName in app/build.gradle');
    }
    const next = gradle
        .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
        .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
    if (next !== gradle) {
        fs.writeFileSync(gradlePath, next);
    }
    return true;
}

function main() {
    if (!fs.existsSync(twaPath)) {
        console.warn('sync-android-version: android/twa-manifest.json not found — skipping');
        return;
    }

    const versionName = getVersion();
    const twa = JSON.parse(fs.readFileSync(twaPath, 'utf8'));
    const currentCode = Number(twa.appVersionCode) || 0;
    const bump = process.env.SKIP_ANDROID_VERSION_BUMP !== '1';

    let versionCode = currentCode;
    if (bump) {
        versionCode = currentCode + 1;
    }
    if (versionCode < 1) versionCode = 1;
    if (versionCode > MAX_VERSION_CODE) {
        throw new Error(`sync-android-version: versionCode ${versionCode} exceeds Android max ${MAX_VERSION_CODE}`);
    }

    twa.appVersionName = versionName;
    twa.appVersion = versionName;
    twa.appVersionCode = versionCode;

    fs.writeFileSync(twaPath, `${JSON.stringify(twa, null, 2)}\n`);
    patchGradle(versionCode, versionName);
    updateManifestChecksum();

    const action = bump && versionCode > currentCode ? 'bumped' : 'synced';
    console.log(
        `sync-android-version: ${action} → versionCode ${versionCode}, versionName "${versionName}"`
    );
}

main();

module.exports = { main, updateManifestChecksum };
