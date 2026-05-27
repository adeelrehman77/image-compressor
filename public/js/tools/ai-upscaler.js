(function () {
    'use strict';

    const { toast, formatBytes, downloadBlob, bindDropZone, runWhenReady, loadExternalScript } =
        window.NexusTools;

    const ORT_JS = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js';
    const ORT_MODULE =
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.bundle.min.mjs';
    const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
    const MODEL_REL = 'models/realesrgan-x4.onnx';
    const MODEL_CACHE = 'nexus-esrgan-model-v2';

    function getModelUrl() {
        const rel =
            window.NexusTools?.resolveAsset?.(MODEL_REL) ||
            `${window.__NEXUS_ASSET_PREFIX != null ? window.__NEXUS_ASSET_PREFIX : ''}${MODEL_REL}`;
        return new URL(rel, window.location.href).href;
    }

    const TILE = 128;
    const OVERLAP = 16;
    const STRIDE = TILE - OVERLAP;
    const MODEL_SCALE = 4;

    let ortReady = false;
    let modelReady = false;
    let modelLoading = false;
    let modelBuffer = null;
    let worker = null;
    let workerInited = false;
    let compareCleanup = null;

    let sourceFile = null;
    let sourceBitmap = null;
    let sourceUrl = null;
    let resultBlob = null;
    let resultUrl = null;
    let aborted = false;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    function yieldUi() {
        return new Promise((r) => setTimeout(r, 0));
    }

    function formatMb(bytes) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    async function loadOrtScript() {
        if (ortReady || typeof ort !== 'undefined') {
            ortReady = true;
            return;
        }
        await loadExternalScript(ORT_JS);
        ortReady = true;
    }

    async function fetchModelWithProgress(onProgress) {
        const modelUrl = getModelUrl();
        const cache = await caches.open(MODEL_CACHE);
        const cached = await cache.match(modelUrl);
        if (cached) {
            const buf = await cached.arrayBuffer();
            if (buf.byteLength >= 4_000_000) {
                onProgress?.(buf.byteLength, buf.byteLength, true);
                return buf;
            }
            await cache.delete(modelUrl);
        }

        const res = await fetch(modelUrl);
        if (!res.ok) {
            throw new Error(`Model fetch failed: HTTP ${res.status} (${modelUrl})`);
        }
        const total = Number(res.headers.get('content-length')) || 0;
        if (!res.body || !total) {
            const buf = await res.arrayBuffer();
            if (buf.byteLength < 4_000_000) {
                throw new Error(`Model file too small (${buf.byteLength} bytes)`);
            }
            await cache.put(modelUrl, new Response(buf.slice(0)));
            onProgress?.(buf.byteLength, buf.byteLength, false);
            return buf;
        }

        const reader = res.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            onProgress?.(loaded, total, false);
        }
        const buf = new Uint8Array(loaded);
        let offset = 0;
        for (const c of chunks) {
            buf.set(c, offset);
            offset += c.length;
        }
        if (loaded < 4_000_000) {
            throw new Error(`Model file too small (${loaded} bytes)`);
        }
        await cache.put(modelUrl, new Response(buf));
        onProgress?.(loaded, total, false);
        return buf.buffer;
    }

    function setModelUi(state, extra = {}) {
        const wrap = document.getElementById('up-model-progress');
        const badge = document.getElementById('up-model-badge');
        const err = document.getElementById('up-model-error');
        const retry = document.getElementById('up-model-retry');
        if (state === 'loading') {
            wrap?.classList.remove('is-hidden');
            err?.classList.add('is-hidden');
            badge?.classList.add('is-hidden');
            if (extra.loaded != null && extra.total) {
                const bar = document.getElementById('up-model-bar');
                const lbl = document.getElementById('up-model-label');
                const pct = Math.min(100, (extra.loaded / extra.total) * 100);
                if (bar) bar.style.width = `${pct}%`;
                if (lbl) {
                    lbl.textContent = extra.cached
                        ? tf('upModelCached', null, 'Model ready ✓ (cached)')
                        : tf('upModelDownloading', { loaded: formatMb(extra.loaded), total: formatMb(extra.total) }, `Downloading AI model… ${formatMb(extra.loaded)} / ${formatMb(extra.total)}`);
                }
            }
        } else if (state === 'ready') {
            wrap?.classList.add('is-hidden');
            err?.classList.add('is-hidden');
            badge?.classList.remove('is-hidden');
            if (badge) badge.textContent = tf('upModelReady', null, 'Model ready ✓');
        } else if (state === 'error') {
            wrap?.classList.add('is-hidden');
            badge?.classList.add('is-hidden');
            err?.classList.remove('is-hidden');
            if (err) err.textContent = tf('upModelError', null, 'Could not load AI model. Check your connection and try again.');
            retry?.classList.remove('is-hidden');
        }
    }

    async function ensureModel() {
        if (modelReady && modelBuffer) return true;
        if (modelLoading) {
            while (modelLoading) await yieldUi();
            return modelReady;
        }
        modelLoading = true;
        setModelUi('loading');
        try {
            await loadOrtScript();
            modelBuffer = await fetchModelWithProgress((loaded, total, cached) => {
                setModelUi('loading', { loaded, total, cached });
            });
            modelReady = true;
            setModelUi('ready');
            return true;
        } catch (err) {
            console.error('[ai-upscaler] model load failed:', err);
            window.NexusSentry?.captureException?.(err, {
                tool: 'ai-upscaler',
                action: 'load-model',
                modelUrl: getModelUrl(),
            });
            setModelUi('error');
            return false;
        } finally {
            modelLoading = false;
        }
    }

    function getWorker() {
        if (worker) return worker;
        const url = window.NexusTools?.assetUrl?.('js/upscaler-worker.mjs') || 'js/upscaler-worker.mjs';
        worker = new Worker(url, { type: 'module' });
        return worker;
    }

    function initWorkerSession() {
        if (workerInited) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const w = getWorker();
            const onMsg = (e) => {
                if (e.data.type === 'model-ready') {
                    w.removeEventListener('message', onMsg);
                    workerInited = true;
                    resolve();
                } else if (e.data.type === 'error') {
                    w.removeEventListener('message', onMsg);
                    reject(new Error(e.data.message));
                }
            };
            w.addEventListener('message', onMsg);
            w.postMessage({
                type: 'init',
                ortModuleUrl: ORT_MODULE,
                wasmPath: ORT_WASM_PATH,
                modelBuffer: modelBuffer.slice(0),
            });
        });
    }

    function runWorkerTile(pixels, inW, inH, tileIndex, totalTiles) {
        return new Promise((resolve, reject) => {
            const w = getWorker();
            const onMsg = (e) => {
                if (e.data.type === 'tile-complete' && e.data.tileIndex === tileIndex) {
                    w.removeEventListener('message', onMsg);
                    resolve(e.data);
                } else if (e.data.type === 'error') {
                    w.removeEventListener('message', onMsg);
                    reject(new Error(e.data.message));
                }
            };
            w.addEventListener('message', onMsg);
            w.postMessage(
                {
                    type: 'run-tile',
                    tileIndex,
                    totalTiles,
                    pixels: pixels.buffer,
                    inW,
                    inH,
                },
                [pixels.buffer]
            );
        });
    }

    function releaseSource() {
        sourceBitmap?.close?.();
        sourceBitmap = null;
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        sourceUrl = null;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = null;
        resultBlob = null;
    }

    function showSection(which) {
        document.getElementById('up-drop-zone')?.classList.toggle('is-hidden', which !== 'upload');
        document.getElementById('up-upload-preview')?.classList.toggle('is-hidden', which === 'upload');
        document.getElementById('up-settings')?.classList.toggle('is-hidden', which === 'upload');
        document.getElementById('up-processing')?.classList.toggle('is-hidden', which !== 'processing');
        document.getElementById('up-results')?.classList.toggle('is-hidden', which !== 'results');
    }

    async function loadImageFile(file) {
        releaseSource();
        sourceFile = file;
        sourceBitmap = await createImageBitmap(file);
        sourceUrl = URL.createObjectURL(file);
        const w = sourceBitmap.width;
        const h = sourceBitmap.height;
        const img = document.getElementById('up-preview-img');
        if (img) {
            img.src = sourceUrl;
            img.alt = file.name;
        }
        const meta = document.getElementById('up-original-meta');
        if (meta) {
            meta.textContent = tf(
                'upOriginalMeta',
                { w, h, size: formatBytes(file.size) },
                `Original: ${w} × ${h} px · ${formatBytes(file.size)}`
            );
        }
        if (Math.max(w, h) > 1200) {
            toast(tf('upLargeWarn', null, 'Large images may take longer. For best results, upscale images under 1200px wide.'), 'warn');
        }
        showSection('upload');
        document.getElementById('up-upload-preview')?.classList.remove('is-hidden');
        document.getElementById('up-settings')?.classList.remove('is-hidden');
    }

    function extractTileCanvas(bitmap, tx, ty, tw, th) {
        const canvas = document.createElement('canvas');
        canvas.width = TILE;
        canvas.height = TILE;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, TILE, TILE);
        ctx.drawImage(bitmap, tx, ty, tw, th, 0, 0, tw, th);
        return ctx.getImageData(0, 0, TILE, TILE);
    }

    function tileWeightWithEdges(x, y, outW, outH, feather, isEdge) {
        let wx = 1;
        let wy = 1;
        if (!isEdge.left && x < feather) wx = x / feather;
        else if (!isEdge.right && x > outW - 1 - feather) wx = (outW - 1 - x) / feather;
        if (!isEdge.top && y < feather) wy = y / feather;
        else if (!isEdge.bottom && y > outH - 1 - feather) wy = (outH - 1 - y) / feather;
        return Math.max(0, Math.min(1, wx * wy));
    }

    function blendTile(acc, weight, rgba, outW, outH, destX, destY, isEdge) {
        const feather = OVERLAP * MODEL_SCALE;
        for (let y = 0; y < outH; y++) {
            for (let x = 0; x < outW; x++) {
                const ox = destX + x;
                const oy = destY + y;
                if (ox < 0 || oy < 0 || ox >= acc.width || oy >= acc.height) continue;
                const w = tileWeightWithEdges(x, y, outW, outH, feather, isEdge);
                const si = (y * outW + x) * 4;
                const di = (oy * acc.width + ox) * 4;
                acc.pixels[di] += rgba[si] * w;
                acc.pixels[di + 1] += rgba[si + 1] * w;
                acc.pixels[di + 2] += rgba[si + 2] * w;
                weight[oy * acc.width + ox] += w;
            }
        }
    }

    function finalizeAccum(acc, weight) {
        const out = new Uint8ClampedArray(acc.width * acc.height * 4);
        for (let i = 0; i < weight.length; i++) {
            const w = weight[i] || 1;
            const j = i * 4;
            out[j] = Math.min(255, acc.pixels[j] / w);
            out[j + 1] = Math.min(255, acc.pixels[j + 1] / w);
            out[j + 2] = Math.min(255, acc.pixels[j + 2] / w);
            out[j + 3] = 255;
        }
        return out;
    }

    function downscaleBicubic(srcW, srcH, rgba, targetScale) {
        const canvas = document.createElement('canvas');
        canvas.width = srcW;
        canvas.height = srcH;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(srcW, srcH);
        img.data.set(rgba);
        ctx.putImageData(img, 0, 0);
        const outW = Math.round(srcW * targetScale);
        const outH = Math.round(srcH * targetScale);
        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(canvas, 0, 0, outW, outH);
        return octx.getImageData(0, 0, outW, outH);
    }

    function bicubicFallback(bitmap, factor) {
        const w = bitmap.width;
        const h = bitmap.height;
        const outW = Math.round(w * factor);
        const outH = Math.round(h * factor);
        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        src.getContext('2d').drawImage(bitmap, 0, 0);
        const dst = document.createElement('canvas');
        dst.width = outW;
        dst.height = outH;
        const ctx = dst.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, outW, outH);
        return ctx.getImageData(0, 0, outW, outH);
    }

    async function upscaleAi(bitmap, factor, onProgress) {
        const w = bitmap.width;
        const h = bitmap.height;
        const outW4 = w * MODEL_SCALE;
        const outH4 = h * MODEL_SCALE;
        const acc = {
            width: outW4,
            height: outH4,
            pixels: new Float32Array(outW4 * outH4 * 4),
        };
        const weight = new Float32Array(outW4 * outH4);

        const tiles = [];
        for (let ty = 0; ty < h; ty += STRIDE) {
            for (let tx = 0; tx < w; tx += STRIDE) {
                const tw = Math.min(TILE, w - tx);
                const th = Math.min(TILE, h - ty);
                tiles.push({ tx, ty, tw, th });
            }
        }

        onProgress?.('prepare', 0, 0, null);
        await initWorkerSession();
        const total = tiles.length;
        let tileTimes = [];

        for (let i = 0; i < total; i++) {
            if (aborted) throw new Error('cancelled');
            const { tx, ty, tw, th } = tiles[i];
            const t0 = performance.now();
            if (tileTimes.length >= 1) {
                const avg = tileTimes.reduce((a, b) => a + b, 0) / tileTimes.length;
                const remaining = avg * (total - i);
                onProgress?.('tile', i + 1, total, remaining / 1000);
            } else {
                onProgress?.('tile', i + 1, total, null);
            }
            const tileData = extractTileCanvas(bitmap, tx, ty, tw, th);
            let result;
            try {
                result = await runWorkerTile(tileData.data, TILE, TILE, i, total);
            } catch (err) {
                const msg = (err?.message || '').toLowerCase();
                if (msg.includes('memory') || msg.includes('wasm') || msg.includes('allocate')) {
                    throw new Error('oom');
                }
                throw err;
            }
            tileTimes.push(performance.now() - t0);
            const rgba = new Uint8ClampedArray(result.rgba);
            const destX = tx * MODEL_SCALE;
            const destY = ty * MODEL_SCALE;
            blendTile(
                acc,
                weight,
                rgba,
                result.outW,
                result.outH,
                destX,
                destY,
                {
                    left: tx === 0,
                    top: ty === 0,
                    right: tx + tw >= w,
                    bottom: ty + th >= h,
                }
            );
            await yieldUi();
        }

        onProgress?.('stitch', 0, 0, null);
        let finalRgba = finalizeAccum(acc, weight);
        if (factor === 2) {
            finalRgba = downscaleBicubic(outW4, outH4, finalRgba, 0.5).data;
        }
        onProgress?.('final', 0, 0, null);
        return finalRgba;
    }

    function setProcessingUi(phase, tileCur, tileTotal, etaSec = null) {
        const status = document.getElementById('up-status');
        const bar = document.getElementById('up-progress-bar');
        const eta = document.getElementById('up-eta');
        const phases = {
            prepare: tf('upPhasePrepare', null, 'Preparing image tiles…'),
            tile: tf('upPhaseTile', { cur: tileCur, total: tileTotal }, `Running AI enhancement… (tile ${tileCur} of ${tileTotal})`),
            stitch: tf('upPhaseStitch', null, 'Stitching output…'),
            final: tf('upPhaseFinal', null, 'Finalising…'),
        };
        if (status) status.textContent = phases[phase] || '';
        if (bar) {
            let pct = 0;
            if (phase === 'prepare') pct = 5;
            else if (phase === 'tile' && tileTotal) pct = (tileCur / tileTotal) * 90;
            else if (phase === 'stitch') pct = 95;
            else if (phase === 'final') pct = 100;
            bar.style.width = `${Math.min(100, pct)}%`;
        }
        if (eta) {
            eta.textContent =
                etaSec > 0
                    ? tf('upEta', { sec: Math.ceil(etaSec) }, `~${Math.ceil(etaSec)}s remaining`)
                    : '';
        }
    }

    function performanceWarning(w, h) {
        const max = Math.max(w, h);
        const el = document.getElementById('up-perf-warn');
        if (!el) return;
        if (max > 1200) {
            el.textContent = tf('upPerf1200', null, 'Large image detected. Processing may take over 2 minutes. Keep this tab open.');
            el.classList.remove('is-hidden');
        } else if (max > 800) {
            el.textContent = tf('upPerf800', null, 'This may take 30–60 seconds on mobile');
            el.classList.remove('is-hidden');
        } else {
            el.classList.add('is-hidden');
        }
    }

    async function runUpscale() {
        if (!sourceBitmap) return;
        const factor = parseInt(document.querySelector('input[name="up-factor"]:checked')?.value || '2', 10);
        const w = sourceBitmap.width;
        const h = sourceBitmap.height;
        aborted = false;
        document.getElementById('up-fallback-banner')?.classList.add('is-hidden');
        performanceWarning(w, h);
        showSection('processing');

        const ok = await ensureModel();
        let imageData;
        let usedFallback = false;
        const outW = factor === 2 ? w * 2 : w * MODEL_SCALE;
        const outH = factor === 2 ? h * 2 : h * MODEL_SCALE;

        try {
            if (!ok) throw new Error('no-model');
            const rgba = await upscaleAi(sourceBitmap, factor, (phase, cur, total, eta) => {
                setProcessingUi(phase, cur, total, eta);
            });
            imageData = new ImageData(rgba, outW, outH);
        } catch (err) {
            if (aborted) {
                restoreUploadUi();
                return;
            }
            usedFallback = true;
            const banner = document.getElementById('up-fallback-banner');
            banner?.classList.remove('is-hidden');
            if (banner) {
                banner.textContent = tf(
                    'upFallbackBanner',
                    null,
                    'AI model unavailable — using standard resize instead. Result quality will be lower.'
                );
            }
            if (err?.message === 'oom') {
                toast(
                    tf('upOom', null, 'This image is too large for your device. Try a smaller input image or use 2× instead of 4×.'),
                    'error'
                );
            }
            imageData = bicubicFallback(sourceBitmap, factor);
            setProcessingUi('final');
        }

        if (aborted) {
            restoreUploadUi();
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        canvas.getContext('2d').putImageData(imageData, 0, 0);

        const format = document.getElementById('up-output-format')?.value || 'image/jpeg';
        const quality = (parseInt(document.getElementById('up-jpeg-quality')?.value, 10) || 90) / 100;
        if (canvas.convertToBlob) {
            resultBlob = await canvas.convertToBlob({
                type: format,
                quality: format === 'image/jpeg' ? quality : undefined,
            });
        } else {
            resultBlob = await new Promise((res, rej) =>
                canvas.toBlob((b) => (b ? res(b) : rej()), format, quality)
            );
        }

        if (document.getElementById('up-compress-toggle')?.checked) {
            resultBlob = await compressBlob(resultBlob, 0.85);
        }

        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(resultBlob);

        showResults(outW, outH, usedFallback);
    }

    function compressBlob(blob, quality) {
        return new Promise((resolve, reject) => {
            const workerUrl =
                window.NexusTools?.assetUrl?.('js/compress-worker.mjs') || 'js/compress-worker.mjs';
            const w = new Worker(workerUrl, { type: 'module' });
            const id = `up-${Date.now()}`;
            w.onmessage = (e) => {
                if (e.data.id !== id) return;
                w.terminate();
                if (e.data.success) resolve(e.data.blob);
                else reject(new Error(e.data.error));
            };
            const file = new File([blob], 'upscaled.jpg', { type: 'image/jpeg' });
            w.postMessage({
                id,
                file,
                config: { quality, format: 'image/jpeg', fixOrientation: false },
            });
        });
    }

    function showResults(outW, outH, usedFallback) {
        showSection('results');
        const origLabel = document.getElementById('up-compare-label-before');
        const upLabel = document.getElementById('up-compare-label-after');
        if (origLabel && sourceFile) {
            origLabel.textContent = tf(
                'upOriginalMeta',
                { w: sourceBitmap.width, h: sourceBitmap.height, size: formatBytes(sourceFile.size) },
                `Original: ${sourceBitmap.width}×${sourceBitmap.height} px · ${formatBytes(sourceFile.size)}`
            );
        }
        if (upLabel) {
            upLabel.textContent = tf(
                'upUpscaledMeta',
                { w: outW, h: outH, size: formatBytes(resultBlob.size) },
                `Upscaled: ${outW}×${outH} px · ${formatBytes(resultBlob.size)}`
            );
        }

        const base = document.getElementById('up-compare-base');
        const top = document.getElementById('up-compare-top');
        const compare = document.getElementById('up-compare');
        const overlay = document.getElementById('up-compare-overlay');
        const handle = document.getElementById('up-compare-handle');
        if (base && top && sourceUrl && resultUrl) {
            base.src = resultUrl;
            top.src = sourceUrl;
            compare?.classList.remove('is-hidden');
            if (compareCleanup) compareCleanup();
            compareCleanup = window.NexusCompareSlider?.setup?.(compare, overlay, handle, top);
        }

        const sizeEl = document.getElementById('up-result-size');
        if (sizeEl) {
            sizeEl.textContent = tf('upResultSize', { size: formatBytes(resultBlob.size) }, `Upscaled file: ${formatBytes(resultBlob.size)}`);
        }
        if (usedFallback) {
            document.getElementById('up-fallback-banner')?.classList.remove('is-hidden');
        }
    }

    function restoreUploadUi() {
        showSection('upload');
        if (sourceFile) {
            document.getElementById('up-upload-preview')?.classList.remove('is-hidden');
            document.getElementById('up-settings')?.classList.remove('is-hidden');
        }
    }

    function resetAll() {
        aborted = true;
        releaseSource();
        sourceFile = null;
        if (compareCleanup) compareCleanup();
        compareCleanup = null;
        showSection('upload');
        document.getElementById('up-upload-preview')?.classList.add('is-hidden');
        document.getElementById('up-settings')?.classList.add('is-hidden');
        document.getElementById('up-perf-warn')?.classList.add('is-hidden');
    }

    function bindFactorUi() {
        document.querySelectorAll('input[name="up-factor"]').forEach((el) => {
            el.addEventListener('change', () => {
                document.querySelectorAll('[data-up-factor-btn]').forEach((btn) => {
                    btn.classList.toggle('is-active', btn.dataset.upFactorBtn === el.value);
                });
            });
        });
        const fmt = document.getElementById('up-output-format');
        const qWrap = document.getElementById('up-jpeg-quality-wrap');
        const syncFmt = () => qWrap?.classList.toggle('is-hidden', fmt?.value !== 'image/jpeg');
        fmt?.addEventListener('change', syncFmt);
        syncFmt();
        const qSlider = document.getElementById('up-jpeg-quality');
        const qVal = document.getElementById('up-jpeg-quality-val');
        const syncQ = () => {
            if (qVal && qSlider) qVal.textContent = `${qSlider.value}%`;
        };
        qSlider?.addEventListener('input', syncQ);
        syncQ();
    }

    runWhenReady(() => {
        loadOrtScript().catch(() => {});

        bindDropZone(
            document.getElementById('up-drop-zone'),
            document.getElementById('up-file-input'),
            (files) => {
                const f = [...files].find((file) => /^image\/(jpeg|png|webp)/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
                if (f) loadImageFile(f);
            }
        );
        document.getElementById('up-file-input')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) loadImageFile(f);
            e.target.value = '';
        });

        document.getElementById('up-run-btn')?.addEventListener('click', () => runUpscale());
        document.getElementById('up-cancel-btn')?.addEventListener('click', () => {
            aborted = true;
            restoreUploadUi();
        });
        document.getElementById('up-download-btn')?.addEventListener('click', () => {
            if (!resultBlob) return;
            const ext = resultBlob.type === 'image/png' ? 'png' : 'jpg';
            const name = (sourceFile?.name || 'image').replace(/\.[^.]+$/, '');
            downloadBlob(resultBlob, `${name}-upscaled-${document.querySelector('input[name="up-factor"]:checked')?.value || 2}x.${ext}`, 'ai-upscaler');
        });
        document.getElementById('up-reset-btn')?.addEventListener('click', resetAll);
        document.getElementById('up-model-retry')?.addEventListener('click', () => {
            modelReady = false;
            modelBuffer = null;
            ensureModel();
        });

        bindFactorUi();
    });

    window.__NEXUS_UPSCALER_ACTIVATE = async function () {
        await ensureModel();
    };

    window.__NEXUS_UPSCALER_LOAD_FILE = loadImageFile;
})();
