const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.TEST_PORT || 3099;
const DIST = path.join(__dirname, 'dist');
const TEST_IMAGE = path.join(__dirname, 'test-image.jpg');

function createTestImage() {
    try {
        const sharp = require('sharp');
        return sharp({
            create: { width: 200, height: 150, channels: 3, background: { r: 79, g: 70, b: 229 } },
        })
            .jpeg()
            .toFile(TEST_IMAGE);
    } catch {
        const minimalJpeg = Buffer.from(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
            'base64'
        );
        fs.writeFileSync(TEST_IMAGE, minimalJpeg);
        return Promise.resolve();
    }
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
