#!/usr/bin/env node
/**
 * Extended QA — compressor options, presets, tool-switch races, GTM, edge cases.
 * Usage: npm run build && node scripts/qa-deep-audit.js
 */
const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createQaFixtures } = require('./test-fixtures');

const PORT = process.env.TEST_PORT || 3098;
const DIST = path.join(__dirname, '..', 'dist');
const issues = [];
const passes = [];

function pass(msg) {
    passes.push(msg);
    console.log('  ✓', msg);
}

function fail(msg, detail) {
    issues.push(detail ? `${msg} — ${detail}` : msg);
    console.log('  ✗', detail ? `${msg} — ${detail}` : msg);
}

async function clickTab(page, tool) {
    await page.evaluate((t) => {
        document.querySelector(`.tool-nav-link[data-tool="${t}"]`)?.click();
    }, tool);
    await page.waitForFunction(
        (t) => !document.querySelector(`[data-tool-panel="${t}"]`)?.classList.contains('is-hidden'),
        { timeout: 8000 },
        tool
    );
}

async function waitCompressDone(page) {
    await page.evaluate(() => {
        const btn = document.getElementById('start-compress-btn');
        if (btn && !btn.disabled && !btn.classList.contains('is-hidden')) btn.click();
    });
    await page.waitForFunction(
        () => {
            const el = document.querySelector('.result-card:last-of-type .compressed-size');
            return el && el.textContent && !el.textContent.includes('…');
        },
        { timeout: 20000 }
    );
}

async function main() {
    if (!fs.existsSync(DIST)) {
        console.error('Run npm run build first');
        process.exit(1);
    }

    const fixtures = createQaFixtures();
    await fixtures.ready();

    const app = express();
    app.use(express.static(DIST, {
        setHeaders(res, fp) {
            if (fp.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        },
    }));
    const server = await new Promise((resolve) => {
        const s = app.listen(PORT, () => resolve(s));
    });
    console.log(`Deep QA → http://localhost:${PORT}\n`);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const t = msg.text();
            if (t.includes('.woff') || (t.includes('Failed to load resource') && t.includes('ads'))) return;
            if (t.includes('ERR_FILE_NOT_FOUND')) return;
            consoleErrors.push(t);
        }
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    try {
        // ── Tool switch race (first click, no reload) ──
        console.log('Tool switch (first click, no reload)');
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForFunction(() => window.__nexusToolRouterBound === true, { timeout: 8000 });

        const toolChecks = [
            { tool: 'pdf-suite', probe: () => document.getElementById('pdf-merge-btn') },
            { tool: 'images-to-pdf', probe: () => document.getElementById('itp-build') },
            { tool: 'svg', probe: () => document.getElementById('svg-download') },
            { tool: 'passport-studio', probe: () => document.getElementById('passport-preset-select') },
        ];

        for (const { tool, probe } of toolChecks) {
            await clickTab(page, tool);
            const ready = await page.evaluate((fn) => {
                const el = new Function(`return (${fn})()`)();
                return Boolean(el);
            }, probe.toString());
            if (ready) pass(`${tool} panel interactive on first switch`);
            else fail(`${tool} panel not ready on first switch`);
        }

        // PDF merge works immediately after tab switch
        await clickTab(page, 'pdf-suite');
        const mergeInput = await page.$('#pdf-merge-input');
        await mergeInput.uploadFile(fixtures.pdf1);
        await mergeInput.uploadFile(fixtures.pdf2);
        await page.waitForFunction(
            () => document.querySelectorAll('#pdf-merge-list .tool-file-item').length >= 2,
            { timeout: 5000 }
        );
        const mergeEnabled = await page.$eval('#pdf-merge-btn', (el) => !el.disabled);
        if (mergeEnabled) pass('PDF merge accepts files on first tab visit');
        else fail('PDF merge button disabled after upload on first visit');

        // ── Compressor presets & UAE ──
        console.log('\nCompressor presets & UAE targets');
        await clickTab(page, 'compress');
        await page.evaluate(() => localStorage.removeItem('nexuscompress-settings'));
        await page.reload({ waitUntil: 'networkidle2' });

        const presets = ['web', 'email', 'social', 'max'];
        for (const p of presets) {
            await page.select('#preset', p);
            const fmt = await page.$eval('#format', (el) => el.value);
            if (fmt) pass(`Preset "${p}" sets format (${fmt})`);
            else fail(`Preset "${p}" did not set format`);
        }

        await page.select('#uae-preset', 'emirates-id');
        const uae = await page.evaluate(() => ({
            targetKb: document.getElementById('target-size-kb')?.value,
            format: document.getElementById('format')?.value,
            quality: document.getElementById('quality')?.value,
        }));
        if (uae.targetKb === '200' && uae.format === 'image/jpeg' && uae.quality === '80') {
            pass('UAE Emirates ID preset applies 200 KB JPEG @ 80%');
        } else {
            fail('UAE Emirates ID preset mismatch', JSON.stringify(uae));
        }

        const fileInput = await page.$('#file-input');
        await fileInput.uploadFile(fixtures.image);
        await waitCompressDone(page);
        const compressedKb = await page.evaluate(() => {
            const text = document.querySelector('.result-card .compressed-size')?.textContent || '';
            const m = text.match(/([\d.]+)\s*(KB|MB|B)/i);
            if (!m) return null;
            const n = parseFloat(m[1]);
            const unit = m[2].toUpperCase();
            if (unit === 'MB') return n * 1024;
            if (unit === 'KB') return n;
            return n / 1024;
        });
        if (compressedKb != null && compressedKb <= 200 * 1.05) {
            pass(`UAE 200 KB target met (${compressedKb.toFixed(1)} KB)`);
        } else {
            fail('UAE 200 KB target not met', String(compressedKb));
        }

        // PNG blocked when target active
        await page.select('#format', 'image/png');
        const pngGuard = await page.evaluate(() => ({
            format: document.getElementById('format')?.value,
            pngDisabled: document.querySelector('#format option[value="image/png"]')?.disabled,
            hintVisible: !document.getElementById('format-target-hint')?.classList.contains('is-hidden'),
        }));
        if (pngGuard.format === 'image/jpeg' && pngGuard.pngDisabled && pngGuard.hintVisible) {
            pass('PNG blocked + hint shown when size cap active');
        } else {
            fail('PNG guard with size cap', JSON.stringify(pngGuard));
        }

        // Recompress with updated settings
        await page.evaluate(() => document.querySelector('.recompress-btn, .rerun-btn')?.click());
        await waitCompressDone(page);
        const statusAfterRetry = await page.evaluate(
            () => document.querySelector('.result-card .status-badge')?.textContent || ''
        );
        if (statusAfterRetry.includes('200') || statusAfterRetry.includes('Saved') || statusAfterRetry.includes('Under')) {
            pass(`Try again recompress works (${statusAfterRetry})`);
        } else {
            fail('Try again failed', statusAfterRetry);
        }

        // Clear target → PNG re-enabled
        await page.evaluate(() => {
            document.getElementById('target-size-value').value = '';
            document.getElementById('target-size-kb').value = '';
            document.getElementById('target-size-value').dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('target-size-value').dispatchEvent(new Event('change', { bubbles: true }));
        });
        const pngReenabled = await page.evaluate(
            () => !document.querySelector('#format option[value="image/png"]')?.disabled
        );
        if (pngReenabled) pass('PNG option re-enabled when size cap cleared');
        else fail('PNG option still disabled after clearing size cap');

        // ── Settings persistence ──
        console.log('\nSettings persistence');
        await page.select('#uae-preset', 'mohre-portal');
        await page.reload({ waitUntil: 'networkidle2' });
        const restored = await page.evaluate(() => ({
            uae: document.getElementById('uae-preset')?.value,
            target: document.getElementById('target-size-kb')?.value,
        }));
        if (restored.uae === 'mohre-portal' && restored.target === '500') {
            pass('UAE preset + target restored from localStorage');
        } else {
            fail('Settings persistence failed', JSON.stringify(restored));
        }

        // ── GTM download tracking ──
        console.log('\nGTM / download tracking');
        await clickTab(page, 'compress');
        await page.evaluate(() => {
            localStorage.removeItem('nexuscompress-settings');
            window.dataLayer = [];
            document.getElementById('uae-preset').value = '';
            document.getElementById('target-size-value').value = '';
            document.getElementById('target-size-kb').value = '';
            document.getElementById('clear-all-btn')?.click();
        });
        await page.waitForFunction(
            () => document.getElementById('results-container')?.classList.contains('is-hidden'),
            { timeout: 5000 }
        );
        const fi = await page.$('#file-input');
        await fi.uploadFile(fixtures.image);
        await waitCompressDone(page);
        await page.waitForSelector('.download-btn', { timeout: 15000 });
        await page.evaluate(() => document.querySelector('.download-btn')?.click());
        await page.waitForFunction(() => (window.dataLayer || []).some((e) => e.event === 'tool_conversion'), { timeout: 10000 });
        const dlEvent = await page.evaluate(() =>
            (window.dataLayer || []).find((e) => e.event === 'tool_conversion')
        );
        if (dlEvent?.event_label === 'file_downloaded' && dlEvent?.tool_name === 'compress') {
            pass('GTM tool_conversion fires on compressor download');
        } else {
            fail('GTM tool_conversion missing on compress download', JSON.stringify(dlEvent));
        }

        await fi.uploadFile(fixtures.image);
        await page.waitForFunction(() => document.querySelectorAll('.download-btn').length >= 2, { timeout: 15000 });
        await page.evaluate(() => {
            window.dataLayer = [];
            document.getElementById('download-all-btn')?.click();
        });
        await page.waitForFunction(
            () => (window.dataLayer || []).some((e) => e.event === 'tool_conversion'),
            { timeout: 20000 }
        );
        const zipEvent = await page.evaluate(() =>
            (window.dataLayer || []).find((e) => e.event === 'tool_conversion')
        );
        if (zipEvent?.tool_name === 'compress') pass('GTM tool_conversion fires on ZIP download');
        else fail('GTM missing on ZIP download', JSON.stringify(zipEvent));

        console.log('\nImages to PDF — WebP');
        await clickTab(page, 'images-to-pdf');
        if (fixtures.webp && fs.existsSync(fixtures.webp)) {
            const itpInput = await page.$('#itp-input');
            await itpInput.uploadFile(fixtures.webp);
            await page.waitForFunction(
                () => document.querySelectorAll('#itp-list .tool-file-item').length >= 1,
                { timeout: 5000 }
            );
            await page.click('#itp-build');
            await page.waitForFunction(() => {
                const btn = document.getElementById('itp-build');
                return btn && !btn.disabled && btn.textContent.includes('Download PDF');
            }, { timeout: 20000 });
            pass('WebP image converts to PDF successfully');
        } else {
            pass('WebP fixture skipped (sharp unavailable)');
        }

        // ── Hash routes for all tools ──
        console.log('\nDirect hash routes');
        for (const hash of ['images-to-pdf', 'pdf-suite', 'svg', 'passport-studio']) {
            await page.goto(`http://localhost:${PORT}/#${hash}`, { waitUntil: 'networkidle2' });
            await page.waitForFunction(
                (h) => !document.querySelector(`[data-tool-panel="${h}"]`)?.classList.contains('is-hidden'),
                { timeout: 8000 },
                hash
            );
            const active = await page.evaluate(
                (h) => document.querySelector(`.tool-nav-link[data-tool="${h}"]`)?.classList.contains('active'),
                hash
            );
            if (active) pass(`Direct #${hash} loads and activates tab`);
            else fail(`Direct #${hash} tab not active`);
        }

        // ── Passport UAE preset ──
        console.log('\nPassport Studio UAE');
        await clickTab(page, 'passport-studio');
        await page.select('#passport-preset-select', 'uae-emirates');
        await page.waitForFunction(() => {
            const w = document.getElementById('passport-warnings');
            return w && !w.classList.contains('is-hidden') && w.textContent.length > 10;
        }, { timeout: 5000 });
        pass('UAE Emirates passport preset shows warnings');

        const photoInput = await page.$('#passport-photo-input');
        await photoInput.uploadFile(fixtures.image);
        await page.waitForFunction(
            () => !document.getElementById('passport-editor')?.classList.contains('is-hidden'),
            { timeout: 8000 }
        );
        await page.click('#passport-export-digital');
        await page.waitForFunction(
            () => document.getElementById('passport-studio-status')?.textContent.includes('Digital export saved'),
            { timeout: 15000 }
        );
        pass('UAE passport digital export works');

        // ── Remove task ──
        console.log('\nCompressor task management');
        await clickTab(page, 'compress');
        await page.evaluate(() => document.getElementById('clear-all-btn')?.click());
        await fi.uploadFile(fixtures.image);
        await page.waitForSelector('.download-btn', { timeout: 15000 });
        const beforeRemove = await page.$$eval('.result-card', (els) => els.length);
        await page.evaluate(() => document.querySelector('.remove-btn')?.click());
        await page.waitForFunction(
            (n) => document.querySelectorAll('.result-card').length === n - 1,
            { timeout: 5000 },
            beforeRemove
        );
        pass('Remove task deletes result card');

        console.log('\nFile type filter');
        await clickTab(page, 'compress');
        await page.evaluate(() => document.getElementById('clear-all-btn')?.click());
        const fakeGif = path.join(fixtures.dir, 'test.gif');
        fs.writeFileSync(fakeGif, 'GIF89a');
        await fi.uploadFile(fakeGif);
        await page.waitForFunction(
            () => {
                const toast = document.getElementById('toast-root')?.textContent || '';
                return toast.includes('JPEG') || toast.includes('supported');
            },
            { timeout: 3000 }
        );
        const rejected = await page.evaluate(
            () => document.querySelectorAll('.result-card').length === 0
        );
        if (rejected) pass('Unsupported GIF rejected with message');
        else fail('Unsupported file type was accepted');

        console.log('\nTable view recompress');
        await fi.uploadFile(fixtures.image);
        await waitCompressDone(page);
        await page.click('#view-table');
        await page.evaluate(() => document.querySelector('.recompress-row')?.click());
        const tableReset = await page.waitForFunction(
            () => document.querySelector('.download-row')?.classList.contains('is-hidden'),
            { timeout: 3000 }
        );
        if (tableReset) pass('Table download hidden during recompress');
        else fail('Table download still visible during recompress');

        // ── Worker version cache bust ──
        console.log('\nAsset wiring');
        const workerSrc = await page.evaluate(() => {
            const entries = performance.getEntriesByType('resource');
            const w = entries.find((e) => e.name.includes('worker.js'));
            return w?.name || null;
        });
        if (workerSrc && workerSrc.includes('worker.js?v=')) {
            pass(`Worker loaded with cache bust (${workerSrc.split('/').pop()})`);
        } else {
            fail('Worker missing version cache bust', workerSrc || 'not found');
        }

        const hasRouter = await page.evaluate(() => typeof window.__nexusToolRouterBound !== 'undefined');
        if (hasRouter) pass('Tool router bound flag present');
        else fail('Tool router not initialized');

        console.log('\nConsole');
        const unique = [...new Set(consoleErrors)];
        if (unique.length === 0) pass('No unexpected console errors');
        else unique.forEach((e) => fail('Console error', e));
    } catch (err) {
        fail('Deep QA aborted', err.message);
    } finally {
        await browser.close();
        server.close();
        fixtures.cleanup();
    }

    console.log('\n══════════════════════════════════════');
    console.log(`Passed: ${passes.length}  |  Issues: ${issues.length}`);
    if (issues.length) {
        console.log('\nIssues:');
        issues.forEach((i, n) => console.log(`  ${n + 1}. ${i}`));
        process.exit(1);
    }
    console.log('\nAll deep QA checks passed.');
}

main();
