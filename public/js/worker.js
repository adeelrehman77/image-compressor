const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const TARGET_QUALITY_STEP = 0.05;
const TARGET_MIN_QUALITY = 0.25;
const TARGET_DEFAULT_START = 0.85;

function resolveOutputType(fileType, format, avifSupported) {
    if (format && format !== 'auto') {
        if (format === 'image/avif' && !avifSupported) return 'image/webp';
        return format;
    }
    if (SUPPORTED_TYPES.includes(fileType)) return fileType;
    return 'image/jpeg';
}

function computeDimensions(bitmap, maxWidth, maxHeight) {
    let width = bitmap.width;
    let height = bitmap.height;

    if (maxWidth && width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
    }
    if (maxHeight && height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
    }
    return { width, height };
}

function roundQuality(q) {
    return Math.round(q * 100) / 100;
}

async function renderToBlob(bitmap, width, height, outputType, quality) {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const opts = { type: outputType };
    if (outputType === 'image/jpeg' || outputType === 'image/webp' || outputType === 'image/avif') {
        opts.quality = quality;
    }
    return offscreen.convertToBlob(opts);
}

async function compressWithQuality(bitmap, width, height, outputType, quality) {
    return renderToBlob(bitmap, width, height, outputType, quality);
}

/**
 * Step quality down by 5% from startQuality until blob fits targetBytes or min quality.
 */
async function compressToTargetSize(bitmap, width, height, outputType, targetBytes, startQuality) {
    if (outputType === 'image/png') {
        const blob = await renderToBlob(bitmap, width, height, outputType, 1);
        return { blob, quality: 1, metTarget: blob.size <= targetBytes };
    }

    const start = Math.min(1, Math.max(TARGET_MIN_QUALITY, startQuality ?? TARGET_DEFAULT_START));
    let smallest = null;
    let smallestQ = TARGET_MIN_QUALITY;

    for (let q = start; q >= TARGET_MIN_QUALITY - 0.001; q -= TARGET_QUALITY_STEP) {
        const rounded = roundQuality(q);
        const blob = await compressWithQuality(bitmap, width, height, outputType, rounded);
        if (!smallest || blob.size < smallest.size) {
            smallest = blob;
            smallestQ = rounded;
        }
        if (blob.size <= targetBytes) {
            return { blob, quality: rounded, metTarget: true };
        }
    }

    return {
        blob: smallest,
        quality: smallestQ,
        metTarget: smallest ? smallest.size <= targetBytes : false,
    };
}

self.onmessage = async function (e) {
    const { id, file, config } = e.data;
    const {
        quality,
        maxWidth,
        maxHeight,
        format,
        targetSizeKb,
        fixOrientation,
        avifSupported,
    } = config;

    try {
        const bitmapOpts = fixOrientation !== false ? { imageOrientation: 'from-image' } : {};
        const bitmap = await createImageBitmap(file, bitmapOpts);

        const origW = bitmap.width;
        const origH = bitmap.height;
        const { width, height } = computeDimensions(bitmap, maxWidth, maxHeight);
        const outputType = resolveOutputType(file.type, format, avifSupported);

        let blob;
        let usedQuality = quality;
        let metTarget = true;

        if (targetSizeKb && targetSizeKb > 0) {
            const targetBytes = targetSizeKb * 1024;
            const startQ = typeof quality === 'number' && quality > 0 ? quality : TARGET_DEFAULT_START;
            const result = await compressToTargetSize(
                bitmap,
                width,
                height,
                outputType,
                targetBytes,
                startQ
            );
            blob = result.blob;
            usedQuality = result.quality;
            metTarget = result.metTarget;
        } else {
            blob = await compressWithQuality(bitmap, width, height, outputType, quality);
        }

        bitmap.close();

        self.postMessage({
            id,
            success: true,
            originalSize: file.size,
            blob,
            outputType,
            width,
            height,
            originalWidth: origW,
            originalHeight: origH,
            usedQuality,
            metTarget,
            targetSizeKb: targetSizeKb || null,
        });
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error.message || String(error),
        });
    }
};
