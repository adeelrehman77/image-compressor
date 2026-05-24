const fs = require('fs');
const os = require('os');
const path = require('path');

const MINIMAL_JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    'base64'
);

const MINIMAL_PDF = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 50 100 Td (Page1) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
308
%%EOF`;

async function writeTestImage(destPath) {
    try {
        const sharp = require('sharp');
        await sharp({
            create: { width: 200, height: 150, channels: 3, background: { r: 79, g: 70, b: 229 } },
        })
            .jpeg()
            .toFile(destPath);
    } catch {
        fs.writeFileSync(destPath, MINIMAL_JPEG);
    }
}

async function writeTestWebp(destPath) {
    try {
        const sharp = require('sharp');
        await sharp({
            create: { width: 120, height: 120, channels: 3, background: { r: 40, g: 120, b: 200 } },
        })
            .webp()
            .toFile(destPath);
        return true;
    } catch {
        return false;
    }
}

function createQaFixtures() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuscompress-qa-'));
    const image = path.join(dir, 'test.jpg');
    const webp = path.join(dir, 'test.webp');
    const svg = path.join(dir, 'test.svg');
    const pdf1 = path.join(dir, 'page1.pdf');
    const pdf2 = path.join(dir, 'page2.pdf');

    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><!-- comment --><metadata>x</metadata><rect width="100" height="100" fill="blue"/></svg>');
    fs.writeFileSync(pdf1, MINIMAL_PDF);
    fs.writeFileSync(pdf2, MINIMAL_PDF.replace('Page1', 'Page2'));

    return {
        dir,
        image,
        webp,
        svg,
        pdf1,
        pdf2,
        async ready() {
            await writeTestImage(image);
            const ok = await writeTestWebp(webp);
            if (!ok) this.webp = null;
        },
        cleanup() {
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

module.exports = { writeTestImage, createQaFixtures, MINIMAL_JPEG };
