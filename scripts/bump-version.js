#!/usr/bin/env node
/**
 * Bump release version, then sync all assets.
 * Usage:
 *   npm run version:stamp   — UTC date-time stamp (YYYYMMDD.HHmm)
 *   npm run version:patch   — alias for stamp (legacy)
 */
const { bumpBuildVersion, formatBuildVersion } = require('./version');
const { main: syncVersion, syncReleaseAssets } = require('./sync-version');

const level = process.argv[2] || 'stamp';
const allowed = new Set(['stamp', 'patch', 'minor', 'major']);
if (!allowed.has(level)) {
    console.error('Usage: node scripts/bump-version.js [stamp|patch|minor|major]');
    process.exit(1);
}

let next;
if (level === 'stamp' || level === 'patch') {
    next = bumpBuildVersion();
} else {
    // Legacy semver bumps — convert to a dated stamp with suffix note in console
    next = formatBuildVersion();
    const { readPackage, writePackage } = require('./version');
    const pkg = readPackage();
    pkg.version = next;
    writePackage(pkg);
    console.warn(`bump-version: ${level} is deprecated — stamped ${next}`);
}

console.log(`bump-version: → ${next}`);
syncReleaseAssets();
