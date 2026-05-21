#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PRESETS = {
    web: { quality: 85, format: 'webp', maxWidth: 1920 },
    email: { quality: 70, format: 'jpeg', maxWidth: 1200 },
    social: { quality: 80, format: 'jpeg', maxWidth: 1080 },
    max: { quality: 95, format: 'png', maxWidth: null },
};

function parseArgs(argv) {
    const args = { paths: [], preset: null, quality: null, format: null, maxWidth: null, maxHeight: null, out: null };
    const rest = [...argv];
    while (rest.length) {
        const a = rest.shift();
        if (a === '--preset') args.preset = rest.shift();
        else if (a === '--quality') args.quality = Number(rest.shift());
        else if (a === '--format') args.format = rest.shift();
        else if (a === '--max-width') args.maxWidth = Number(rest.shift());
        else if (a === '--max-height') args.maxHeight = Number(rest.shift());
        else if (a === '--out') args.out = rest.shift();
        else if (!a.startsWith('-')) args.paths.push(a);
    }
    return args;
}

async function main() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.error('Install dependencies: npm install');
        process.exit(1);
    }

    const args = parseArgs(process.argv.slice(2));
    if (args.paths.length === 0) {
        console.log(`Usage: nexus-compress <file|dir> [options]

Options:
  --preset web|email|social|max
  --quality 1-100
  --format jpeg|png|webp|avif
  --max-width <px>
  --max-height <px>
  --out <directory>`);
        process.exit(0);
    }

    const preset = args.preset && PRESETS[args.preset] ? PRESETS[args.preset] : {};
    const quality = args.quality ?? preset.quality ?? 80;
    const format = (args.format || preset.format || 'webp').replace('image/', '');
    const maxWidth = args.maxWidth ?? preset.maxWidth ?? null;
    const maxHeight = args.maxHeight ?? preset.maxHeight ?? null;

    const files = [];
    for (const p of args.paths) {
        const abs = path.resolve(p);
        if (!fs.existsSync(abs)) {
            console.warn(`Skip (not found): ${p}`);
            continue;
        }
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
            walk(abs, files);
        } else if (/\.(jpe?g|png|webp|avif|gif)$/i.test(abs)) {
            files.push(abs);
        }
    }

    if (files.length === 0) {
        console.error('No image files found.');
        process.exit(1);
    }

    const outDir = args.out ? path.resolve(args.out) : null;
    if (outDir) fs.mkdirSync(outDir, { recursive: true });

    let totalBefore = 0;
    let totalAfter = 0;

    for (const file of files) {
        let pipeline = sharp(file, { failOn: 'none' }).rotate();
        if (maxWidth || maxHeight) {
            pipeline = pipeline.resize({
                width: maxWidth || undefined,
                height: maxHeight || undefined,
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        const ext = format === 'jpeg' ? 'jpg' : format;
        const base = path.basename(file, path.extname(file));
        const dest = outDir
            ? path.join(outDir, `${base}-compressed.${ext}`)
            : path.join(path.dirname(file), `${base}-compressed.${ext}`);

        if (format === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        else if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
        else if (format === 'webp') pipeline = pipeline.webp({ quality });
        else if (format === 'avif') pipeline = pipeline.avif({ quality });
        else {
            console.warn(`Unknown format ${format}, using webp`);
            pipeline = pipeline.webp({ quality });
        }

        const before = fs.statSync(file).size;
        await pipeline.toFile(dest);
        const after = fs.statSync(dest).size;
        totalBefore += before;
        totalAfter += after;
        const pct = ((1 - after / before) * 100).toFixed(1);
        console.log(`${path.basename(file)} → ${path.basename(dest)} (${pct}% smaller)`);
    }

    const saved = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
    console.log(`\nDone: ${files.length} file(s), ${saved}% total reduction`);
}

function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (/\.(jpe?g|png|webp|avif|gif)$/i.test(full)) out.push(full);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
