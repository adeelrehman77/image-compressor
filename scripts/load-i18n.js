#!/usr/bin/env node
/** Load i18n bundles from public/js/i18n.js in Node (build scripts). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadI18n(publicRoot) {
    const i18nPath = path.join(publicRoot, 'js/i18n.js');
    const src = fs.readFileSync(i18nPath, 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(src, sandbox, { filename: i18nPath });
    return {
        en: sandbox.window.__NEXUS_I18N?.en || {},
        ar: sandbox.window.__NEXUS_I18N?.ar || {},
        seoAr: sandbox.window.__NEXUS_I18N_SEO?.ar || {},
        metaAr: sandbox.window.__NEXUS_I18N_META?.ar || {},
    };
}

module.exports = { loadI18n };
