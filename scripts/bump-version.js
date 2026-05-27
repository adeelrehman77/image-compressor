#!/usr/bin/env node
/**
 * Bump package.json semver (patch | minor | major), then sync all assets.
 * Usage: npm run version:patch | version:minor | version:major
 */
const fs = require('fs');
const path = require('path');
const { pkgPath, readPackage } = require('./version');
const { main: syncVersion } = require('./sync-version');

const level = process.argv[2] || 'patch';
const allowed = new Set(['patch', 'minor', 'major']);
if (!allowed.has(level)) {
    console.error('Usage: node scripts/bump-version.js [patch|minor|major]');
    process.exit(1);
}

function bump(ver, lvl) {
    const parts = ver.split('.').map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    if (lvl === 'major') {
        parts[0] += 1;
        parts[1] = 0;
        parts[2] = 0;
    } else if (lvl === 'minor') {
        parts[1] += 1;
        parts[2] = 0;
    } else {
        parts[2] += 1;
    }
    return parts.join('.');
}

const pkg = readPackage();
const next = bump(pkg.version, level);
pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`bump-version: ${level} → v${next}`);
syncVersion();
