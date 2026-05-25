#!/usr/bin/env node
/**
 * Full-app QA audit — runs against dist/ on TEST_PORT (default 3099).
 * Usage: npm run build && node scripts/qa-audit.js
 */
const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createQaFixtures } = require('./test-fixtures');

const PORT = process.env.TEST_PORT || 3099;
const DIST = path.join(__dirname, '..', 'dist');

const issues = [];
const passes = [];

function pass(msg) {
    passes.push(msg);
    console.log('  ✓', msg);
}

function fail(msg, detail) {
    const line = detail ? `${msg} — ${detail}` : msg;
    issues.push(line);
    console.log('  ✗', line);
}

async function clickTab(page, tool) {
    await page.evaluate((t) => {
        document.querySelector(`.tool-nav-link[data-tool="${t}"]`)?.click();
    }, tool);
    await page.waitForFunction(
        (t) => !document.querySelector(`[data-tool-panel="${t}"]`)?.classList.contains('is-hidden'),
        { timeout: 5000 },
        tool
    );
}

async function main() {
    if (!fs.existsSync(DIST)) {
        console.error('Run npm run build first');
        process.exit(1);
    }

    const fixtures = createQaFixtures();
    await fixtures.ready();
    const TEST_IMAGE = fixtures.image;
    const TEST_SVG = fixtures.svg;
    const TEST_PDF1 = fixtures.pdf1;
    const TEST_PDF2 = fixtures.pdf2;

    const app = express();
    app.use(express.static(DIST, {
        setHeaders(res, fp) {
            if (fp.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        },
    }));

    const server = await new Promise((resolve) => {
        const s = app.listen(PORT, () => resolve(s));
    });
    console.log(`QA audit → http://localhost:${PORT}\n`);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const consoleErrors = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const t = msg.text();
            if (t.includes('.woff') || t.includes('Failed to load resource') && t.includes('ads')) return;
            consoleErrors.push(t);
        }
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    try {
        console.log('Navigation & routing');
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
        pass('Home page loads');

        const tabs = ['compress', 'images-to-pdf', 'pdf-suite', 'svg', 'passport-studio'];
        for (const tool of tabs) {
            await clickTab(page, tool);
            const visible = await page.evaluate((t) => {
                const panel = document.querySelector(`[data-tool-panel="${t}"]`);
                const link = document.querySelector(`.tool-nav-link[data-tool="${t}"]`);
                return panel && !panel.classList.contains('is-hidden') && link?.classList.contains('active');
            }, tool);
            if (visible) pass(`Tab switch: ${tool}`);
            else fail(`Tab switch failed: ${tool}`);
        }

        await clickTab(page, 'compress');
        await page.evaluate(() => document.querySelector('.seo-tool-chips a[href="#passport-studio"]')?.click());
        await page.waitForFunction(() => location.hash === '#passport-studio', { timeout: 3000 });
        const hashOk = await page.evaluate(
            () => !document.getElementById('tool-panel-passport-studio')?.classList.contains('is-hidden')
        );
        if (hashOk) pass('Footer chip navigates to Passport Studio');
        else fail('Footer chip navigation to Passport Studio failed');

        // ── Theme ──
        console.log('\nTheme');
        await clickTab(page, 'compress');
        const beforeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await page.click('#theme-toggle');
        await page.waitForFunction((b) => document.documentElement.getAttribute('data-theme') !== b, {}, beforeTheme);
        const afterTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        if (afterTheme !== beforeTheme) pass(`Theme toggles (${beforeTheme} → ${afterTheme})`);
        else fail('Theme toggle did not change data-theme');
        await page.click('#theme-toggle');

        // ── Image Compressor ──
        console.log('\nImage Compressor');
        await clickTab(page, 'compress');
        await page.evaluate(() => localStorage.removeItem('nexuscompress-settings'));
        await page.reload({ waitUntil: 'networkidle2' });

        const fileInput = await page.$('#file-input');
        await fileInput.uploadFile(TEST_IMAGE);
        await page.click('#start-compress-btn');
        await page.waitForSelector('.download-btn:not(.is-hidden)', { timeout: 15000 });
        pass('Single image compress + download button appears');

        const cardCount = await page.$$eval('.result-card', (els) => els.length);
        if (cardCount >= 1) pass('Result card rendered');
        else fail('No result card after upload');

        await page.evaluate(() => {
            document.getElementById('view-table')?.scrollIntoView({ block: 'center' });
            document.getElementById('view-table')?.click();
        });
        await page.waitForFunction(
            () => document.getElementById('view-table')?.getAttribute('aria-pressed') === 'true',
            { timeout: 3000 }
        );
        const tableVisible = await page.evaluate(
            () => !document.getElementById('results-table-wrap')?.classList.contains('is-hidden')
        );
        if (tableVisible) pass('Table view toggle');
        else fail('Table view not shown');

        await page.evaluate(() => document.getElementById('view-cards')?.click());
        await fileInput.uploadFile(TEST_IMAGE);
        await page.click('#start-compress-btn');
        await page.waitForFunction(() => document.querySelectorAll('.download-btn:not(.is-hidden)').length >= 2, { timeout: 15000 });
        await page.waitForSelector('#download-all-btn:not(.is-hidden)', { timeout: 5000 });
        pass('Download ZIP button visible with 2+ files');

        await page.waitForSelector('.compare-view-btn:not([disabled])', { timeout: 10000 });
        await page.evaluate(() => document.querySelector('.result-card .compare-view-btn')?.click());
        await page.waitForSelector('#compare-modal:not(.is-hidden)', { timeout: 5000 });
        pass('Compare modal opens');
        await page.click('#compare-modal-close');
        await page.waitForFunction(() => document.getElementById('compare-modal')?.classList.contains('is-hidden'), { timeout: 5000 });

        await page.evaluate(() => document.getElementById('clear-all-btn')?.scrollIntoView({ block: 'center' }));
        await page.click('#clear-all-btn');
        await page.waitForFunction(
            () => document.getElementById('results-container')?.classList.contains('is-hidden'),
            { timeout: 5000 }
        );
        pass('Clear all resets results');

        // ── Images to PDF ──
        console.log('\nImages to PDF');
        await clickTab(page, 'images-to-pdf');
        const itpInput = await page.$('#itp-input');
        await itpInput.uploadFile(TEST_IMAGE);
        await page.waitForFunction(() => document.querySelectorAll('#itp-list .tool-file-item').length >= 1, { timeout: 5000 });
        pass('Images to PDF file list populated');

        const buildDisabled = await page.$eval('#itp-build', (el) => el.disabled);
        if (!buildDisabled) pass('Build PDF enabled after adding image');
        else fail('Build PDF still disabled after adding image');

        await page.click('#itp-build');
        await page.waitForFunction(() => {
            const btn = document.getElementById('itp-build');
            return btn && !btn.disabled && btn.textContent.includes('Download PDF');
        }, { timeout: 20000 });
        pass('PDF build completes');

        // ── PDF Merge & Split ──
        console.log('\nPDF Merge & Split');
        await clickTab(page, 'pdf-suite');
        await page.click('.pdf-tab[data-pdf-tab="merge"]');

        const mergeInput = await page.$('#pdf-merge-input');
        await mergeInput.uploadFile(TEST_PDF1);
        await mergeInput.uploadFile(TEST_PDF2);
        await page.waitForFunction(() => document.querySelectorAll('#pdf-merge-list .tool-file-item').length >= 2, { timeout: 5000 });
        pass('PDF merge list has 2 files');

        await page.click('#pdf-merge-btn');
        await page.waitForFunction(() => {
            const btn = document.getElementById('pdf-merge-btn');
            return btn && btn.textContent.includes('Download merged PDF');
        }, { timeout: 20000 });
        pass('PDF merge completes');

        await page.click('.pdf-tab[data-pdf-tab="split"]');
        const splitInput = await page.$('#pdf-split-input');
        await splitInput.uploadFile(TEST_PDF1);
        await page.waitForFunction(() => {
            const info = document.getElementById('pdf-split-info');
            return info && info.textContent && info.textContent.length > 0;
        }, { timeout: 10000 });
        pass('PDF split shows file info');

        await page.click('#pdf-split-btn');
        await page.waitForFunction(() => {
            const btn = document.getElementById('pdf-split-btn');
            return btn && !btn.disabled;
        }, { timeout: 15000 });
        pass('PDF split completes');

        // ── SVG Optimizer ──
        console.log('\nSVG Optimizer');
        await clickTab(page, 'svg');
        const svgInput = await page.$('#svg-input');
        await svgInput.uploadFile(TEST_SVG);
        await page.waitForFunction(() => {
            const after = document.getElementById('svg-after');
            return after && after.value && after.value.length > 0;
        }, { timeout: 5000 });
        const optimized = await page.$eval('#svg-after', (el) => el.value);
        const stripped = !optimized.includes('<!-- comment -->') && !optimized.includes('metadata');
        if (stripped) pass('SVG optimizer strips comments/metadata');
        else fail('SVG optimizer did not strip bloat', optimized.slice(0, 80));

        const dlDisabled = await page.$eval('#svg-download', (el) => el.disabled);
        if (!dlDisabled) pass('SVG download enabled');
        else fail('SVG download still disabled');

        // ── Passport Studio ──
        console.log('\nPassport Studio');
        await clickTab(page, 'passport-studio');
        await page.select('#passport-preset-select', 'india-passport-seva');
        await page.waitForFunction(() => {
            const w = document.getElementById('passport-warnings');
            return w && !w.classList.contains('is-hidden') && w.textContent.includes('ICAO');
        }, { timeout: 3000 });
        pass('Passport preset shows India warnings');

        const photoInput = await page.$('#passport-photo-input');
        await photoInput.uploadFile(TEST_IMAGE);
        await page.waitForFunction(() => {
            const editor = document.getElementById('passport-editor');
            return editor && !editor.classList.contains('is-hidden');
        }, { timeout: 5000 });
        pass('Passport photo loads editor');

        const exportHidden = await page.$eval('#passport-sidebar-export', (el) => el.classList.contains('is-hidden'));
        if (!exportHidden) pass('Export controls visible after photo');
        else fail('Export sidebar still hidden after photo');

        await page.click('#passport-export-digital');
        await page.waitForFunction(() => {
            const st = document.getElementById('passport-studio-status');
            return st && st.textContent.includes('Digital export saved');
        }, { timeout: 15000 });
        pass('Passport digital export succeeds');

        await page.evaluate(() => {
            document.getElementById('passport-clear-photo')?.scrollIntoView({ block: 'center' });
        });
        await page.click('#passport-clear-photo');
        await page.waitForFunction(() => {
            const dz = document.getElementById('passport-drop-zone');
            return dz && !dz.classList.contains('is-hidden');
        }, { timeout: 3000 });
        pass('Clear photo resets drop zone');

        // Photo without preset
        await page.select('#passport-preset-select', '');
        const photoInput2 = await page.$('#passport-photo-input');
        await photoInput2.uploadFile(TEST_IMAGE);
        await page.waitForFunction(() => {
            const st = document.getElementById('passport-studio-status');
            return st && st.textContent.includes('Select a preset first');
        }, { timeout: 3000 });
        pass('Upload without preset shows guidance');

        // ── Direct hash load ──
        console.log('\nDirect hash URLs');
        await page.goto(`http://localhost:${PORT}/#passport-studio`, { waitUntil: 'domcontentloaded' });
        const hashTitle = await page.title();
        const hashSeo = await page.evaluate(() => document.getElementById('seo-heading')?.textContent || '');
        const hashAria = await page.evaluate(() => ({
            panelHidden: document.getElementById('tool-panel-passport-studio')?.getAttribute('aria-hidden'),
            tabSelected: document.getElementById('tab-passport-studio')?.getAttribute('aria-selected'),
            tabControls: document.getElementById('tab-passport-studio')?.getAttribute('aria-controls'),
        }));
        if (hashTitle.includes('Passport')) pass('Direct #passport-studio sets document title immediately');
        else fail('Hash URL title flash', hashTitle);
        if (hashSeo.includes('Passport')) pass('Direct hash sets SEO heading before router');
        else fail('Hash URL SEO heading flash', hashSeo.slice(0, 60));
        if (hashAria.panelHidden === 'false' && hashAria.tabSelected === 'true' && hashAria.tabControls === 'tool-panel-passport-studio') {
            pass('Direct hash ARIA tab/panel wiring correct');
        } else {
            fail('Hash URL ARIA state', JSON.stringify(hashAria));
        }

        await page.goto(`http://localhost:${PORT}/#svg`, { waitUntil: 'networkidle2' });
        const svgPanel = await page.evaluate(
            () => !document.getElementById('tool-panel-svg')?.classList.contains('is-hidden')
        );
        if (svgPanel) pass('Direct #svg hash loads SVG tool');
        else fail('Direct #svg hash did not activate SVG panel');

        // ── Console errors ──
        console.log('\nConsole');
        const uniqueErrors = [...new Set(consoleErrors)];
        if (uniqueErrors.length === 0) pass('No unexpected console errors');
        else uniqueErrors.forEach((e) => fail('Console error', e));

    } catch (err) {
        fail('QA run aborted', err.message);
    } finally {
        await browser.close();
        server.close();
        fixtures.cleanup();
    }

    console.log('\n══════════════════════════════════════');
    console.log(`Passed: ${passes.length}  |  Issues: ${issues.length}`);
    if (issues.length) {
        console.log('\nIssues found:');
        issues.forEach((i, n) => console.log(`  ${n + 1}. ${i}`));
        process.exit(1);
    }
    console.log('\nAll QA checks passed.');
}

main();
