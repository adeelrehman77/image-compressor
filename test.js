const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { writeTestImage } = require('./scripts/test-fixtures');

const PORT = process.env.TEST_PORT || 3099;
const DIST = path.join(__dirname, 'dist');
const TEST_IMAGE = path.join(__dirname, 'test-image.jpg');

function createTestImage() {
    return writeTestImage(TEST_IMAGE);
}

if (!fs.existsSync(DIST)) {
    console.error('Run npm run build before npm test');
    process.exit(1);
}

const app = express();
app.use(
    express.static(DIST, {
        setHeaders(res, filePath) {
            if (filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
            }
        },
    })
);

createTestImage().then(() => {
    const server = app.listen(PORT, async () => {
        console.log(`Test server → http://localhost:${PORT}`);

        try {
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();
            let hasErrors = false;

            page.on('console', (msg) => {
                if (msg.type() !== 'error') return;
                const text = msg.text();
                if (text.includes('Failed to load resource') && text.includes('.woff')) return;
                console.error('Browser Error:', text);
                hasErrors = true;
            });
            page.on('pageerror', (err) => {
                console.error('Page Error:', err);
                hasErrors = true;
            });

            await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle2', timeout: 30000 });

            const fileInput = await page.$('#file-input');
            await fileInput.uploadFile(TEST_IMAGE);

            await page.waitForSelector('.download-btn', { timeout: 15000 });

            const summary = await page.$eval('#batch-count', (el) => el.textContent);
            console.log('Batch summary:', summary);

            await page.evaluate(() => {
                localStorage.removeItem('nexuscompress-settings');
            });
            await page.reload({ waitUntil: 'networkidle2' });

            await page.select('#uae-preset', 'emirates-id');
            const uaeSettings = await page.evaluate(() => ({
                targetKb: document.getElementById('target-size-kb').value,
                format: document.getElementById('format').value,
                quality: document.getElementById('quality').value,
            }));
            if (uaeSettings.targetKb !== '200' || uaeSettings.format !== 'image/jpeg' || uaeSettings.quality !== '80') {
                throw new Error(`UAE preset mismatch: ${JSON.stringify(uaeSettings)}`);
            }
            console.log('UAE Emirates ID preset applied:', uaeSettings);

            const fileInput2 = await page.$('#file-input');
            await fileInput2.uploadFile(TEST_IMAGE);
            await page.waitForFunction(
                () => {
                    const el = document.querySelector('.result-card:last-of-type .compressed-size');
                    return el && el.textContent && !el.textContent.includes('…');
                },
                { timeout: 15000 }
            );

            const targetBytes = 200 * 1024;
            const compressedSize = await page.evaluate(() => {
                const cards = document.querySelectorAll('.result-card');
                const card = cards[cards.length - 1];
                if (!card) return null;
                const text = card.querySelector('.compressed-size')?.textContent || '';
                const m = text.match(/([\d.]+)\s*(KB|MB|B)/i);
                if (!m) return null;
                const n = parseFloat(m[1]);
                if (m[2].toUpperCase() === 'MB') return n * 1024 * 1024;
                if (m[2].toUpperCase() === 'KB') return n * 1024;
                return n;
            });
            if (compressedSize == null) {
                throw new Error('Could not read compressed size from UI');
            }
            console.log('Compressed size (bytes):', compressedSize, 'target:', targetBytes);
            if (compressedSize > targetBytes * 1.05) {
                throw new Error(`Compressed file exceeds 200KB target: ${compressedSize} bytes`);
            }
            console.log('Target file size (200KB) test passed.');

            await page.waitForSelector('.compare-view-btn:not([disabled])', { timeout: 15000 });
            await page.evaluate(() => {
                document.querySelector('.result-card:last-of-type .compare-view-btn')?.click();
            });
            await page.waitForSelector('#compare-modal:not(.is-hidden)', { timeout: 10000 });
            const modalOpen = await page.evaluate(() => {
                const modal = document.getElementById('compare-modal');
                const base = document.getElementById('compare-modal-base');
                const top = document.getElementById('compare-modal-top');
                return Boolean(
                    modal &&
                    !modal.classList.contains('is-hidden') &&
                    base?.src &&
                    top?.src
                );
            });
            if (!modalOpen) throw new Error('Compare modal did not open with image URLs');
            await page.click('#compare-modal-close');
            await page.waitForFunction(
                () => document.getElementById('compare-modal')?.classList.contains('is-hidden'),
                { timeout: 3000 }
            );
            console.log('Compare View modal test passed.');

            const hasBuiltCss = fs.existsSync(path.join(DIST, 'css', 'app.css'));
            if (!hasBuiltCss) {
                console.error('Missing dist/css/app.css');
                process.exit(1);
            }

            if (hasErrors) {
                console.error('Test completed with console errors.');
                process.exit(1);
            }

            console.log('Test completed successfully.');
            await browser.close();
            server.close();
            process.exit(0);
        } catch (e) {
            console.error('Test failed:', e);
            server.close();
            process.exit(1);
        }
    });
});
