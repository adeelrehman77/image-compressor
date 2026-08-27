#!/usr/bin/env node
/**
 * Post-build checks — fails CI/deploy if dist/ is missing critical v2.2+ markup.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const { getVersion } = require('./version');
const {
    countFaqPage,
    assertHashDocumentHasNoFaqSchema,
    assertToolPanelsHaveNoFaqSchema,
    DEDICATED_FAQ_GUIDES,
} = require('./seo-faq-policy');
const pkgVersion = getVersion();

function assertFile(rel, needles) {
    const file = path.join(distDir, rel);
    if (!fs.existsSync(file)) {
        throw new Error(`verify-dist: missing ${rel}`);
    }
    const html = fs.readFileSync(file, 'utf8');
    for (const needle of needles) {
        if (!html.includes(needle)) {
            throw new Error(`verify-dist: ${rel} missing expected markup: ${needle}`);
        }
    }
}

const enHtmlRaw = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

// Guard: tokens.css must be linked (Phase 2 design tokens)
if (!enHtmlRaw.includes('tokens.css')) throw new Error('verify-dist: dist/index.html missing tokens.css link');
// Guard: old version strings must not appear
if (enHtmlRaw.includes('v2.1.0')) throw new Error('verify-dist: dist/index.html still contains old version string v2.1.0');
// Guard: old wrong UAE portal link must not appear
if (enHtmlRaw.includes('uae-portal-compression.html"')) throw new Error('verify-dist: dist/index.html contains wrong UAE portal link (uae-portal-compression.html)');

assertHashDocumentHasNoFaqSchema(enHtmlRaw, 'dist/index.html');
assertToolPanelsHaveNoFaqSchema(enHtmlRaw, 'dist/index.html');

if (!enHtmlRaw.includes('guides/nexuscompress-image-compressor-faq')) {
    throw new Error('verify-dist: dist/index.html missing compressor FAQ guide link');
}

assertFile('index.html', [
    'id="tab-photo-checker"',
    'id="tab-redactor"',
    'id="tab-ai-upscaler"',
    'id="tab-image-cropper"',
    'id="tab-collage-maker"',
    'id="tab-remove-bg"',
    'data-pdf-tab="to-images"',
    'guides/best-image-format-uae-government-portals',
    'UAE portal guide',
    `data-app-version="${pkgVersion}"`,
    `id="app-version"`,
]);

if (enHtmlRaw.includes('دليل بوابات الإمارات') && !enHtmlRaw.includes('lang="ar"')) {
    throw new Error('verify-dist: dist/index.html must not contain Arabic hero guide label');
}

const { AR_HERO_SUB } = require('./generate-ar-index');

assertFile('ar/index.html', [
    'id="tab-photo-checker"',
    'فاحص الصور',
    'id="tab-redactor"',
    'تعتيم المستندات',
    'id="tab-ai-upscaler"',
    'تكبير بالذكاء الاصطناعي',
    'id="tab-image-cropper"',
    'id="tab-collage-maker"',
    'id="tab-remove-bg"',
    'data-pdf-tab="to-images"',
    ' — اضغط الصور.',
    'فوراً. بخصوصية تامة.',
    AR_HERO_SUB,
    'دليل بوابات الإمارات',
    '../guides/uae-portal-compression-ar',
    '../guides/best-image-format-uae-government-portals',
    `data-app-version="${pkgVersion}"`,
    `v${pkgVersion}`,
]);

const arHtml = fs.readFileSync(path.join(distDir, 'ar/index.html'), 'utf8');
assertHashDocumentHasNoFaqSchema(arHtml, 'dist/ar/index.html');
assertToolPanelsHaveNoFaqSchema(arHtml, 'dist/ar/index.html');

if (/compress images\. Instantly/i.test(arHtml) || /Shrink JPEG, PNG, WebP &amp; AVIF in your browser/i.test(arHtml)) {
    throw new Error('verify-dist: dist/ar/index.html still contains English compress hero');
}

const versionJson = JSON.parse(fs.readFileSync(path.join(distDir, 'version.json'), 'utf8'));
if (versionJson.version !== pkgVersion) {
    throw new Error(`verify-dist: version.json (${versionJson.version}) !== package.json (${pkgVersion})`);
}
if (!versionJson.buildId) {
    throw new Error('verify-dist: version.json missing buildId');
}

const sw = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
const { swCacheId } = require('./version');
const expectedCache = swCacheId(pkgVersion, versionJson.buildId);
if (!sw.includes(`const CACHE = '${expectedCache}'`)) {
    throw new Error(`verify-dist: dist/sw.js cache must be ${expectedCache}`);
}

const worker = path.join(distDir, 'js/compress-worker.mjs');
if (!fs.existsSync(worker)) {
    throw new Error('verify-dist: missing js/compress-worker.mjs');
}

const photoChecker = path.join(distDir, 'js/tools/photo-checker.js');
if (!fs.existsSync(photoChecker)) {
    throw new Error('verify-dist: missing js/tools/photo-checker.js');
}

const redactor = path.join(distDir, 'js/tools/document-redactor.js');
if (!fs.existsSync(redactor)) {
    throw new Error('verify-dist: missing js/tools/document-redactor.js');
}

const upscalerWorker = path.join(distDir, 'js/upscaler-worker.mjs');
if (!fs.existsSync(upscalerWorker)) {
    throw new Error('verify-dist: missing js/upscaler-worker.mjs');
}

const aiUpscaler = path.join(distDir, 'js/tools/ai-upscaler.js');
if (!fs.existsSync(aiUpscaler)) {
    throw new Error('verify-dist: missing js/tools/ai-upscaler.js');
}

const esrganModel = path.join(distDir, 'models/realesrgan-x4.onnx');
if (!fs.existsSync(esrganModel) || fs.statSync(esrganModel).size < 4_000_000) {
    throw new Error('verify-dist: missing or incomplete models/realesrgan-x4.onnx');
}

const bgRemovalBundle = path.join(distDir, 'vendor/background-removal.mjs');
const bgRemovalResources = path.join(distDir, 'vendor/bg-removal-data/resources.json');
if (!fs.existsSync(bgRemovalBundle)) {
    throw new Error('verify-dist: missing vendor/background-removal.mjs — run npm install');
}
if (!fs.existsSync(bgRemovalResources)) {
    throw new Error('verify-dist: missing vendor/bg-removal-data/resources.json — run npm install');
}

const assetlinks = path.join(distDir, '.well-known/assetlinks.json');
if (!fs.existsSync(assetlinks)) {
    throw new Error('verify-dist: missing .well-known/assetlinks.json (required for TWA)');
}
const assetlinksJson = JSON.parse(fs.readFileSync(assetlinks, 'utf8'));
if (!Array.isArray(assetlinksJson) || !assetlinksJson[0]?.target?.package_name) {
    throw new Error('verify-dist: assetlinks.json must be a JSON array with target.package_name');
}

const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
if (!manifest.icons?.some((i) => i.sizes === '192x192') || !manifest.icons?.some((i) => i.sizes === '512x512')) {
    throw new Error('verify-dist: manifest.json must include 192x192 and 512x512 icons');
}
if (manifest.start_url !== '/' || manifest.scope !== '/') {
    throw new Error('verify-dist: manifest start_url and scope must be "/" for TWA');
}

for (const rel of DEDICATED_FAQ_GUIDES) {
    const file = path.join(distDir, rel);
    if (!fs.existsSync(file)) {
        throw new Error(`verify-dist: missing ${rel}`);
    }
    const html = fs.readFileSync(file, 'utf8');
    const faqCount = countFaqPage(html);
    if (faqCount !== 1) {
        throw new Error(`verify-dist: ${rel} must have exactly one FAQPage (found ${faqCount})`);
    }
}

const removeBgTool = path.join(distDir, 'tools/remove-background/index.html');
if (!fs.existsSync(removeBgTool)) {
    throw new Error('verify-dist: missing dist/tools/remove-background/index.html — run generate-tool-pages');
}
const removeBgHtml = fs.readFileSync(removeBgTool, 'utf8');
if (!removeBgHtml.includes('https://compress.funadventure.ae/tools/remove-background/')) {
    throw new Error('verify-dist: remove-background tool page missing extensionless canonical');
}
if (!removeBgHtml.includes('window.__NEXUS_INITIAL_TOOL')) {
    throw new Error('verify-dist: tool page missing __NEXUS_INITIAL_TOOL bootstrap');
}
assertHashDocumentHasNoFaqSchema(removeBgHtml, 'dist/tools/remove-background/index.html');
assertToolPanelsHaveNoFaqSchema(removeBgHtml, 'dist/tools/remove-background/index.html');

if (!fs.existsSync(path.join(distDir, 'js/tool-routes.js'))) {
    throw new Error('verify-dist: missing js/tool-routes.js');
}

// Guard: every data-i18n key in index.html must exist in both en and ar i18n packs
{
    const i18nPath = path.join(distDir, 'js/i18n.js');
    if (!fs.existsSync(i18nPath)) {
        throw new Error('verify-dist: missing dist/js/i18n.js');
    }
    const i18nSrc = fs.readFileSync(i18nPath, 'utf8');
    const keys = [...new Set([...enHtmlRaw.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]))];
    const missing = [];
    for (const key of keys) {
        const re = new RegExp(`(?:^|[\\s,{])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
        const matches = i18nSrc.match(new RegExp(re.source, 'g')) || [];
        // Expect at least one en + one ar occurrence (two definitions)
        if (matches.length < 2) missing.push(key);
    }
    if (missing.length) {
        throw new Error(`verify-dist: data-i18n keys missing from i18n en/ar packs: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ` (+${missing.length - 20} more)` : ''}`);
    }
}

console.log(`verify-dist: OK (v${pkgVersion}) — dist/index.html & dist/ar/index.html`);
