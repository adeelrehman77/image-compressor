const fs = require('fs');
const path = require('path');

async function main() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        return;
    }

    const out = path.join(__dirname, '../public/og-image.png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f172a"/>
          <stop offset="100%" style="stop-color:#1e1b4b"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#6366f1"/>
          <stop offset="100%" style="stop-color:#22d3ee"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <rect x="80" y="200" width="120" height="120" rx="28" fill="url(#accent)"/>
      <text x="140" y="285" font-family="Arial,sans-serif" font-size="52" font-weight="bold" fill="#fff" text-anchor="middle">NC</text>
      <text x="230" y="250" font-family="Arial,sans-serif" font-size="56" font-weight="bold" fill="#f8fafc">Free Image Compressor</text>
      <text x="230" y="310" font-family="Arial,sans-serif" font-size="32" fill="#94a3b8">Reduce size instantly · 100% in your browser</text>
      <text x="230" y="380" font-family="Arial,sans-serif" font-size="24" fill="#64748b">JPEG · PNG · WebP · AVIF — No uploads</text>
    </svg>`;

    await sharp(Buffer.from(svg)).png().toFile(out);
    console.log('Generated public/og-image.png');
}

main().catch(() => {});
