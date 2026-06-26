#!/usr/bin/env node
/**
 * Sync Android versionCode / versionName before Bubblewrap release builds.
 *
 * - versionName ← package.json (YYYYMMDD.HHmm UTC)
 * - versionCode ← max(previous + 1, versionToAndroidCode(name))
 *
 * Env:
 *   SKIP_ANDROID_VERSION_BUMP=1  sync name only, do not bump versionCode
 */
const fs = require('fs');
const path = require('path');
const { getVersion, versionToAndroidCode } = require('./version');

const root = path.join(__dirname, '..');
const twaPath = path.join(root, 'android/twa-manifest.json');
const gradlePath = path.join(root, 'android/app/build.gradle');

function patchGradle(versionCode, versionName) {
    if (!fs.existsSync(gradlePath)) {
        console.warn('sync-android-version: android/app/build.gradle not found — run bubblewrap init first');
        return false;
    }
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    const next = gradle
        .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
        .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
    if (next === gradle) {
        throw new Error('sync-android-version: could not patch versionCode/versionName in app/build.gradle');
    }
    fs.writeFileSync(gradlePath, next);
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
    const stampFloor = versionToAndroidCode(versionName);

    let versionCode = currentCode;
    if (bump) {
        versionCode = Math.max(currentCode + 1, stampFloor);
    } else if (versionCode < stampFloor) {
        versionCode = stampFloor;
    }

    if (versionCode < 1) versionCode = 1;

    twa.appVersionName = versionName;
    twa.appVersion = versionName;
    twa.appVersionCode = versionCode;

    fs.writeFileSync(twaPath, `${JSON.stringify(twa, null, 2)}\n`);
    patchGradle(versionCode, versionName);

    const action = bump && versionCode > currentCode ? 'bumped' : 'synced';
    console.log(
        `sync-android-version: ${action} → versionCode ${versionCode}, versionName "${versionName}"`
    );
}

main();
