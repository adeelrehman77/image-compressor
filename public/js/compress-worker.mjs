/**
 * Compression worker — jSquash WASM codecs with Canvas API fallback.
 */
const JSQUASH = 'https://cdn.jsdelivr.net/npm';
const JSQ_VER = '1.6.0';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const LOSSY_TYPES = ['image/jpeg', 'image/webp', 'image/avif'];

const TARGET_QUALITY_STEP = 0.05;
const TARGET_MIN_QUALITY = 0.25;
const TARGET_DEFAULT_START = 0.85;
const TARGET_MIN_DIMENSION = 320;
const TARGET_DIMENSION_SCALE = 0.88;

const CODEC_LABEL = {
    MozJPEG: 'MozJPEG',
    libwebp: 'libwebp',
    libavif: 'libavif',
    OxiPNG: 'OxiPNG',
    Canvas: 'Canvas',
};

let encoders = null;
let codecsFailed = false;

async function loadCodecs() {
    if (encoders || codecsFailed) return encoders;
    try {
        const [jpegMod, webpMod, avifMod, pngMod] = await Promise.all([
            import(`${JSQUASH}/@jsquash/jpeg@${JSQ_VER}/encode.js`),
            import(`${JSQUASH}/@jsquash/webp@${JSQ_VER}/encode.js`),
            import(`${JSQUASH}/@jsquash/avif@${JSQ_VER}/encode.js`),
            import(`${JSQUASH}/@jsquash/png@${JSQ_VER}/encode.js`),
        ]);
        await Promise.all([
            jpegMod.init(),
            webpMod.init(),
            avifMod.init(),
            pngMod.init(),
        ]);
        encoders = {
            jpeg: jpegMod.default,
            webp: webpMod.default,
            avif: avifMod.default,
            png: pngMod.default,
        };
    } catch {
        codecsFailed = true;
        encoders = null;
    }
    return encoders;
}

function resolveOutputType(fileType, format, avifSupported, targetSizeKb) {
    let resolved;
    if (format && format !== 'auto') {
        resolved = format === 'image/avif' && !avifSupported ? 'image/webp' : format;
    } else if (SUPPORTED_TYPES.includes(fileType)) {
        resolved = fileType;
    } else {
        resolved = 'image/jpeg';
    }
    if (targetSizeKb && targetSizeKb > 0 && !LOSSY_TYPES.includes(resolved)) {
        return 'image/jpeg';
    }
    return resolved;
}

function getCropRect(srcW, srcH, aspectRatio) {
    if (!aspectRatio) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
    const parts = aspectRatio.split(':').map(Number);
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { sx: 0, sy: 0, sw: srcW, sh: srcH };
    }
    const target = parts[0] / parts[1];
    let cropW = srcW;
    let cropH = srcH;
    if (srcW / srcH > target) cropW = Math.round(srcH * target);
    else cropH = Math.round(srcW / target);
    return {
        sx: Math.floor((srcW - cropW) / 2),
        sy: Math.floor((srcH - cropH) / 2),
        sw: Math.max(1, cropW),
        sh: Math.max(1, cropH),
    };
}

function computeOutputSize(bitmap, { maxWidth, maxHeight, scalePercent, aspectRatio }) {
    const crop = getCropRect(bitmap.width, bitmap.height, aspectRatio);
    let width = crop.sw;
    let height = crop.sh;
    const pct = scalePercent && scalePercent > 0 ? scalePercent : 100;
    if (pct !== 100) {
        width = Math.max(1, Math.round(width * (pct / 100)));
        height = Math.max(1, Math.round(height * (pct / 100)));
    }
    if (maxWidth && width > maxWidth) {
        height = Math.max(1, Math.round((height * maxWidth) / width));
        width = maxWidth;
    }
    if (maxHeight && height > maxHeight) {
        width = Math.max(1, Math.round((width * maxHeight) / height));
        height = maxHeight;
    }
    return { crop, width: Math.max(1, width), height: Math.max(1, height) };
}

function roundQuality(q) {
    return Math.round(q * 100) / 100;
}

async function rasterize(bitmap, crop, width, height) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const offscreen = new OffscreenCanvas(w, h);
    try {
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
    } finally {
        offscreen.width = 0;
        offscreen.height = 0;
    }
}

async function renderToBlob(bitmap, crop, width, height, outputType, quality) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const offscreen = new OffscreenCanvas(w, h);
    try {
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
        const opts = { type: outputType };
        if (LOSSY_TYPES.includes(outputType)) opts.quality = quality;
        return await offscreen.convertToBlob(opts);
    } finally {
        offscreen.width = 0;
        offscreen.height = 0;
    }
}

async function encodeWithWasm(imageData, outputType, quality, codecs) {
    const q = Math.max(1, Math.min(100, Math.round(quality * 100)));
    let buffer;
    let engine;
    if (outputType === 'image/jpeg' && codecs.jpeg) {
        buffer = await codecs.jpeg(imageData, { quality: q });
        engine = 'MozJPEG';
    } else if (outputType === 'image/webp' && codecs.webp) {
        buffer = await codecs.webp(imageData, { quality: q });
        engine = 'libwebp';
    } else if (outputType === 'image/avif' && codecs.avif) {
        buffer = await codecs.avif(imageData, { quality: q });
        engine = 'libavif';
    } else if (outputType === 'image/png' && codecs.png) {
        buffer = await codecs.png(imageData);
        engine = 'OxiPNG';
    } else {
        return null;
    }
    return { blob: new Blob([buffer], { type: outputType }), engine };
}

async function compressOnce(bitmap, crop, width, height, outputType, quality, codecs) {
    const imageData = await rasterize(bitmap, crop, width, height);
    if (codecs) {
        const wasm = await encodeWithWasm(imageData, outputType, quality, codecs);
        if (wasm) return wasm;
    }
    const blob = await renderToBlob(bitmap, crop, width, height, outputType, quality);
    return { blob, engine: 'Canvas' };
}

async function compressWithQuality(bitmap, crop, width, height, outputType, quality, codecs) {
    return compressOnce(bitmap, crop, width, height, outputType, quality, codecs);
}

async function compressToTargetSize(bitmap, crop, width, height, outputType, targetBytes, startQuality, codecs) {
    const type = LOSSY_TYPES.includes(outputType) ? outputType : 'image/jpeg';
    const start = Math.min(1, Math.max(TARGET_MIN_QUALITY, startQuality ?? TARGET_DEFAULT_START));

    let best = null;
    let bestQ = TARGET_MIN_QUALITY;
    let bestW = width;
    let bestH = height;
    let bestEngine = 'Canvas';
    let w = width;
    let h = height;

    for (let attempt = 0; attempt < 24; attempt++) {
        for (let q = start; q >= TARGET_MIN_QUALITY - 0.001; q -= TARGET_QUALITY_STEP) {
            const rounded = roundQuality(q);
            const { blob, engine } = await compressOnce(bitmap, crop, w, h, type, rounded, codecs);
            if (!best || blob.size < best.size) {
                best = blob;
                bestQ = rounded;
                bestW = w;
                bestH = h;
                bestEngine = engine;
            }
            if (blob.size <= targetBytes) {
                return {
                    blob,
                    quality: rounded,
                    metTarget: true,
                    width: w,
                    height: h,
                    outputType: type,
                    codecEngine: engine,
                };
            }
        }
        if (Math.max(w, h) <= TARGET_MIN_DIMENSION) break;
        const nextW = Math.max(1, Math.round(w * TARGET_DIMENSION_SCALE));
        const nextH = Math.max(1, Math.round(h * TARGET_DIMENSION_SCALE));
        if (nextW === w && nextH === h) break;
        w = nextW;
        h = nextH;
    }

    return {
        blob: best,
        quality: bestQ,
        metTarget: best ? best.size <= targetBytes : false,
        width: bestW,
        height: bestH,
        outputType: type,
        codecEngine: bestEngine,
    };
}

self.onmessage = async function (e) {
    const { id, file, config } = e.data;
    const {
        quality,
        maxWidth,
        maxHeight,
        scalePercent,
        aspectRatio,
        format,
        targetSizeKb,
        fixOrientation,
        avifSupported,
    } = config;

    try {
        const codecs = await loadCodecs();
        const bitmapOpts = fixOrientation !== false ? { imageOrientation: 'from-image' } : {};
        const bitmap = await createImageBitmap(file, bitmapOpts);

        const origW = bitmap.width;
        const origH = bitmap.height;
        const { crop, width, height } = computeOutputSize(bitmap, {
            maxWidth,
            maxHeight,
            scalePercent,
            aspectRatio,
        });
        const outputType = resolveOutputType(file.type, format, avifSupported, targetSizeKb);

        let blob;
        let usedQuality = quality;
        let metTarget = true;
        let outW = width;
        let outH = height;
        let finalType = outputType;
        let codecEngine = 'Canvas';

        if (targetSizeKb && targetSizeKb > 0) {
            const targetBytes = targetSizeKb * 1024;
            const startQ = typeof quality === 'number' && quality > 0 ? quality : TARGET_DEFAULT_START;
            const result = await compressToTargetSize(
                bitmap,
                crop,
                width,
                height,
                outputType,
                targetBytes,
                startQ,
                codecs
            );
            blob = result.blob;
            usedQuality = result.quality;
            metTarget = result.metTarget;
            outW = result.width;
            outH = result.height;
            finalType = result.outputType;
            codecEngine = result.codecEngine;
        } else {
            const result = await compressWithQuality(bitmap, crop, width, height, outputType, quality, codecs);
            blob = result.blob;
            codecEngine = result.engine;
        }

        bitmap.close();

        self.postMessage({
            id,
            success: true,
            originalSize: file.size,
            blob,
            outputType: finalType,
            width: outW,
            height: outH,
            originalWidth: origW,
            originalHeight: origH,
            usedQuality,
            metTarget,
            targetSizeKb: targetSizeKb || null,
            forcedLossy: targetSizeKb > 0 && format === 'image/png',
            codecEngine,
            codecLabel: CODEC_LABEL[codecEngine] || codecEngine,
        });
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error.message || String(error),
        });
    }
};
