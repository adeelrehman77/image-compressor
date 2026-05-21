const fs = require('fs');
const path = require('path');

async function main() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        return;
    }
    const dir = path.join(__dirname, '../icons');
    fs.mkdirSync(dir, { recursive: true });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6366f1"/><stop offset="100%" style="stop-color:#22d3ee"/>
      </linearGradient></defs>
      <rect width="512" height="512" rx="96" fill="url(#g)"/>
      <text x="256" y="290" font-family="Arial,sans-serif" font-size="140" font-weight="bold" fill="#fff" text-anchor="middle">NC</text>
    </svg>`;

    const buf = Buffer.from(svg);
    await sharp(buf).resize(192, 192).png().toFile(path.join(dir, 'icon-192.png'));
    await sharp(buf).resize(512, 512).png().toFile(path.join(dir, 'icon-512.png'));
    console.log('Generated PWA icons');
}

main().catch(() => {});
