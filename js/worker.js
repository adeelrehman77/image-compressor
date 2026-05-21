const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

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
    const blob = await renderToBlob(bitmap, width, height, outputType, quality);
    return blob;
}

async function compressToTargetSize(bitmap, width, height, outputType, targetBytes) {
    const lossless = outputType === 'image/png';
    if (lossless) {
        const blob = await renderToBlob(bitmap, width, height, outputType, 1);
        return { blob, quality: 1 };
    }

    let low = 0.1;
    let high = 1;
    let best = null;
    let bestQ = 0.8;

    for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        const blob = await compressWithQuality(bitmap, width, height, outputType, mid);
        if (blob.size <= targetBytes) {
            best = blob;
            bestQ = mid;
            low = mid;
        } else {
            high = mid;
        }
    }

    if (!best) {
        best = await compressWithQuality(bitmap, width, height, outputType, 0.1);
        bestQ = 0.1;
    }
    return { blob: best, quality: bestQ };
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

        if (targetSizeKb && targetSizeKb > 0) {
            const targetBytes = targetSizeKb * 1024;
            const result = await compressToTargetSize(bitmap, width, height, outputType, targetBytes);
            blob = result.blob;
            usedQuality = result.quality;
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
        });
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error.message || String(error),
        });
    }
};
