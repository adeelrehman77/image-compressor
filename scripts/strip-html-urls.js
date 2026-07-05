#!/usr/bin/env node
/**
 * One-shot (re-runnable) migration: extensionless URLs in all public HTML.
 */
const fs = require('fs');
const path = require('path');
const { stripHtmlUrlsInHtml } = require('./public-url');

const publicDir = path.join(__dirname, '../public');

function walkHtml(dir, files = []) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            if (name !== 'vendor' && name !== 'models') walkHtml(full, files);
        } else if (name.endsWith('.html')) {
            files.push(full);
        }
    }
    return files;
}

function main() {
    const files = walkHtml(publicDir);
    let changed = 0;
    for (const file of files) {
        const before = fs.readFileSync(file, 'utf8');
        const after = stripHtmlUrlsInHtml(before);
        if (after !== before) {
            fs.writeFileSync(file, after);
            changed += 1;
            console.log('  patched', path.relative(publicDir, file));
        }
    }
    console.log(`strip-html-urls: updated ${changed} file(s)`);
}

if (require.main === module) {
    main();
}

module.exports = { main };
