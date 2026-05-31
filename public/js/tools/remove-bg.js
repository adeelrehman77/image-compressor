(function () {
    'use strict';

    const { toast, downloadBlob, bindDropZone, runWhenReady } = window.NexusTools;

    const LIB_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm';
    const PUBLIC_PATH = 'https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/';
    const MODEL_CACHE_KEY = 'nexus-bg-model-cached';

    const ACCEPTED = /^image\/(jpeg|png|webp)$/i;
    const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

    let libModule = null;
    let modelReady = false;
    let modelLoading = false;

    let sourceFile = null;
    let sourceUrl = null;
    let nobgBlob = null;
    let previewUrl = null;
    let compareCleanup = null;
    let processing = false;
    let bgReplaceImage = null;
    let bgReplaceImageUrl = null;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    function supportsWasm() {
        try {
            return (
                typeof WebAssembly === 'object' &&
                typeof WebAssembly.instantiate === 'function'
            );
        } catch {
            return false;
        }
    }

    function isAccepted(file) {
        return ACCEPTED.test(file.type) || ACCEPTED_EXT.test(file.name || '');
    }

    function releaseUrl(url) {
        if (url) URL.revokeObjectURL(url);
    }

    function baseName(file) {
        return (file?.name || 'image').replace(/\.[^.]+$/, '');
    }

    async function canvasToBlob(canvas, type) {
        if (canvas.convertToBlob) {
            return canvas.convertToBlob({ type, quality: 1 });
        }
        return new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type);
        });
    }

    async function ensureLib() {
        if (libModule) return libModule;
        libModule = await import(LIB_URL);
        return libModule;
    }

    function getConfig(onProgress) {
        return {
            publicPath: PUBLIC_PATH,
            model: 'small',
            output: { format: 'image/png', quality: 1 },
            progress: onProgress,
        };
    }

    function setModelStep(step) {
        [1, 2, 3].forEach((n) => {
            const el = document.getElementById(`rbg-step-${n}`);
            if (!el) return;
            el.classList.remove('is-active', 'is-done');
            if (n < step) el.classList.add('is-done');
            else if (n === step) el.classList.add('is-active');
        });
    }

    function setModelUi(state, opts = {}) {
        const wrap = document.getElementById('rbg-model-progress');
        const badge = document.getElementById('rbg-model-badge');
        const err = document.getElementById('rbg-model-error');
        const cachedNote = document.getElementById('rbg-model-cached-note');
        if (state === 'loading') {
            wrap?.classList.remove('is-hidden');
            badge?.classList.add('is-hidden');
            err?.classList.add('is-hidden');
            cachedNote?.classList.add('is-hidden');
            if (opts.pct != null) {
                const bar = document.getElementById('rbg-model-bar');
                if (bar) bar.style.width = `${Math.round(opts.pct)}%`;
            }
        } else if (state === 'ready') {
            wrap?.classList.add('is-hidden');
            badge?.classList.remove('is-hidden');
            if (opts.cached) {
                cachedNote?.classList.remove('is-hidden');
                badge.textContent = tf('rbgModelCached', null, 'Model cached, ready instantly');
            } else {
                cachedNote?.classList.add('is-hidden');
                badge.textContent = tf('rbgModelReady', null, 'Model ready ✓');
            }
        } else if (state === 'error') {
            wrap?.classList.add('is-hidden');
            err?.classList.remove('is-hidden');
        }
    }

    async function ensureModel() {
        if (modelReady) return true;
        if (modelLoading) {
            while (modelLoading) await new Promise((r) => setTimeout(r, 100));
            return modelReady;
        }
        if (!supportsWasm()) {
            document.getElementById('rbg-wasm-warn')?.classList.remove('is-hidden');
            return false;
        }

        modelLoading = true;
        setModelStep(1);
        setModelUi('loading', { pct: 0 });

        let sawDownload = false;
        let totalBytes = 0;
        let loadedBytes = 0;
        const wasCached = localStorage.getItem(MODEL_CACHE_KEY) === '1';

        try {
            const { preload } = await ensureLib();
            setModelStep(2);
            await preload(
                getConfig((key, current, total) => {
                    if (key.startsWith('fetch:')) {
                        sawDownload = true;
                        loadedBytes = current;
                        totalBytes = total;
                        const pct = total ? (current / total) * 100 : 0;
                        setModelUi('loading', { pct });
                    }
                    if (key.startsWith('compute')) {
                        setModelStep(3);
                    }
                })
            );
            modelReady = true;
            if (sawDownload) localStorage.setItem(MODEL_CACHE_KEY, '1');
            setModelStep(3);
            setModelUi('ready', { cached: wasCached && !sawDownload });
            return true;
        } catch (err) {
            console.error(err);
            setModelUi('error');
            toast(tf('rbgModelError', null, 'Could not load AI model. Check your connection and try again.'), 'error');
            return false;
        } finally {
            modelLoading = false;
        }
    }

    async function applyFeather(blob, featherPx) {
        if (!featherPx || featherPx <= 0) return blob;
        const bmp = await createImageBitmap(blob);
        const w = bmp.width;
        const h = bmp.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        bmp.close();

        const imgData = ctx.getImageData(0, 0, w, h);
        const alphaCanvas = document.createElement('canvas');
        alphaCanvas.width = w;
        alphaCanvas.height = h;
        const actx = alphaCanvas.getContext('2d');
        const alphaData = actx.createImageData(w, h);
        for (let i = 0; i < imgData.data.length; i += 4) {
            const a = imgData.data[i + 3];
            alphaData.data[i] = a;
            alphaData.data[i + 1] = a;
            alphaData.data[i + 2] = a;
            alphaData.data[i + 3] = 255;
        }
        actx.putImageData(alphaData, 0, 0);

        const blurred = document.createElement('canvas');
        blurred.width = w;
        blurred.height = h;
        const bctx = blurred.getContext('2d');
        bctx.filter = `blur(${featherPx}px)`;
        bctx.drawImage(alphaCanvas, 0, 0);
        const blurredAlpha = bctx.getImageData(0, 0, w, h);
        for (let i = 0; i < imgData.data.length; i += 4) {
            imgData.data[i + 3] = blurredAlpha.data[i];
        }
        ctx.putImageData(imgData, 0, 0);
        return canvasToBlob(canvas, 'image/png');
    }

    function getBgMode() {
        const active = document.querySelector('.rbg-bg-swatch.is-active');
        return active?.dataset.bgMode || 'transparent';
    }

    function getBgColor() {
        const custom = document.getElementById('rbg-bg-custom-color');
        const active = document.querySelector('.rbg-bg-swatch.is-active');
        if (active?.dataset.bgColor) return active.dataset.bgColor;
        return custom?.value || '#ffffff';
    }

    async function composePreview(fromBlob) {
        const mode = getBgMode();
        const bmp = await createImageBitmap(fromBlob);
        const w = bmp.width;
        const h = bmp.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        if (mode === 'color') {
            ctx.fillStyle = getBgColor();
            ctx.fillRect(0, 0, w, h);
        } else if (mode === 'image' && bgReplaceImage) {
            const bgBmp = await createImageBitmap(bgReplaceImage);
            const scale = Math.max(w / bgBmp.width, h / bgBmp.height);
            const sw = bgBmp.width * scale;
            const sh = bgBmp.height * scale;
            ctx.drawImage(bgBmp, (w - sw) / 2, (h - sh) / 2, sw, sh);
            bgBmp.close();
        }

        ctx.drawImage(bmp, 0, 0);
        bmp.close();

        if (mode === 'transparent') {
            return fromBlob;
        }
        return canvasToBlob(canvas, 'image/png');
    }

    async function rebuildPreview() {
        if (!nobgBlob || !sourceUrl) return;
        const feather = parseInt(document.getElementById('rbg-feather')?.value, 10) || 0;
        let processed = await applyFeather(nobgBlob, feather);
        const composed = await composePreview(processed);
        releaseUrl(previewUrl);
        previewUrl = URL.createObjectURL(composed);

        const base = document.getElementById('rbg-compare-base');
        const top = document.getElementById('rbg-compare-top');
        const compare = document.getElementById('rbg-compare');
        const overlay = document.getElementById('rbg-compare-overlay');
        const handle = document.getElementById('rbg-compare-handle');
        if (base && top) {
            base.src = previewUrl;
            top.src = sourceUrl;
            compare?.classList.remove('is-hidden');
            if (compareCleanup) compareCleanup();
            compareCleanup = window.NexusCompareSlider?.setup?.(compare, overlay, handle, top);
        }
    }

    function setProcessing(active, status, pct) {
        const wrap = document.getElementById('rbg-processing');
        const statusEl = document.getElementById('rbg-status');
        const bar = document.getElementById('rbg-progress-bar');
        wrap?.classList.toggle('is-hidden', !active);
        if (statusEl && status) statusEl.textContent = status;
        if (bar && pct != null) bar.style.width = `${Math.round(pct)}%`;
    }

    function showResults() {
        document.getElementById('rbg-drop-zone')?.classList.add('is-hidden');
        document.getElementById('rbg-results')?.classList.remove('is-hidden');
        document.getElementById('rbg-sidebar')?.classList.remove('is-hidden');
        document.getElementById('rbg-download-btn').disabled = false;
        document.getElementById('rbg-reset-btn')?.classList.remove('is-hidden');
    }

    function resetAll() {
        processing = false;
        releaseUrl(sourceUrl);
        releaseUrl(previewUrl);
        releaseUrl(bgReplaceImageUrl);
        sourceUrl = null;
        previewUrl = null;
        bgReplaceImageUrl = null;
        sourceFile = null;
        nobgBlob = null;
        bgReplaceImage = null;
        if (compareCleanup) compareCleanup();
        compareCleanup = null;

        document.getElementById('rbg-drop-zone')?.classList.remove('is-hidden');
        document.getElementById('rbg-results')?.classList.add('is-hidden');
        document.getElementById('rbg-sidebar')?.classList.add('is-hidden');
        document.getElementById('rbg-processing')?.classList.add('is-hidden');
        document.getElementById('rbg-download-btn').disabled = true;
        document.getElementById('rbg-reset-btn')?.classList.add('is-hidden');
        document.getElementById('rbg-compare')?.classList.add('is-hidden');
    }

    async function processFile(file) {
        if (processing) return;
        if (!isAccepted(file)) {
            toast(tf('rbgNeedImage', null, 'Please use a JPEG, PNG, or WebP image.'), 'warn');
            return;
        }

        processing = true;
        releaseUrl(sourceUrl);
        releaseUrl(previewUrl);
        releaseUrl(bgReplaceImageUrl);
        sourceUrl = null;
        previewUrl = null;
        bgReplaceImageUrl = null;
        sourceFile = null;
        nobgBlob = null;
        bgReplaceImage = null;
        if (compareCleanup) compareCleanup();
        compareCleanup = null;
        document.getElementById('rbg-results')?.classList.add('is-hidden');
        document.getElementById('rbg-sidebar')?.classList.add('is-hidden');
        document.getElementById('rbg-compare')?.classList.add('is-hidden');

        sourceFile = file;
        sourceUrl = URL.createObjectURL(file);
        document.getElementById('rbg-drop-zone')?.classList.add('is-hidden');

        setProcessing(true, tf('rbgLoadingModel', null, 'Loading AI model…'), 5);
        const ok = await ensureModel();
        if (!ok) {
            processing = false;
            resetAll();
            return;
        }

        setProcessing(true, tf('rbgRemoving', null, 'Removing background…'), 15);
        try {
            const { removeBackground } = await ensureLib();
            let inferencePct = 15;
            const rawBlob = await removeBackground(
                file,
                getConfig((key, current, total) => {
                    if (key.startsWith('compute')) {
                        inferencePct = 15 + (current / Math.max(total, 1)) * 75;
                        setProcessing(
                            true,
                            tf('rbgRemoving', null, 'Removing background…'),
                            inferencePct
                        );
                    }
                })
            );
            nobgBlob = rawBlob;
            setProcessing(true, tf('rbgFinishing', null, 'Finishing…'), 95);
            await rebuildPreview();
            setProcessing(false);
            showResults();
            toast(tf('rbgDone', null, 'Background removed!'), 'success');
        } catch (err) {
            console.error(err);
            toast(tf('rbgProcessFailed', null, 'Background removal failed. Try a smaller image.'), 'error');
            resetAll();
        } finally {
            processing = false;
        }
    }

    async function downloadResult() {
        if (!nobgBlob || !sourceFile) return;
        const feather = parseInt(document.getElementById('rbg-feather')?.value, 10) || 0;
        let blob = await applyFeather(nobgBlob, feather);
        const mode = getBgMode();
        if (mode !== 'transparent') {
            blob = await composePreview(blob);
        }
        downloadBlob(blob, `${baseName(sourceFile)}-nobg.png`, 'remove-bg');
    }

    function bindBgSwatches() {
        document.querySelectorAll('.rbg-bg-swatch').forEach((sw) => {
            sw.addEventListener('click', () => {
                document.querySelectorAll('.rbg-bg-swatch').forEach((s) => s.classList.remove('is-active'));
                sw.classList.add('is-active');
                rebuildPreview().catch(() => {});
            });
        });
        document.getElementById('rbg-bg-custom-color')?.addEventListener('input', (e) => {
            document.querySelectorAll('.rbg-bg-swatch').forEach((s) => s.classList.remove('is-active'));
            document.querySelector('.rbg-bg-swatch[data-bg-mode="color"]')?.classList.add('is-active');
            rebuildPreview().catch(() => {});
        });
    }

    runWhenReady(() => {
        if (!supportsWasm()) {
            document.getElementById('rbg-wasm-warn')?.classList.remove('is-hidden');
        }

        bindDropZone(
            document.getElementById('rbg-drop-zone'),
            document.getElementById('rbg-file-input'),
            (files) => {
                const f = files[0];
                if (f) processFile(f);
            }
        );

        document.getElementById('rbg-file-input')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
            e.target.value = '';
        });

        document.getElementById('rbg-feather')?.addEventListener('input', (e) => {
            const val = document.getElementById('rbg-feather-val');
            if (val) val.textContent = `${e.target.value}px`;
            if (nobgBlob) rebuildPreview().catch(() => {});
        });

        document.querySelector('.rbg-bg-swatch[data-bg-mode="image"]')?.addEventListener('click', () => {
            document.getElementById('rbg-bg-image-input')?.click();
        });

        document.getElementById('rbg-bg-image-input')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (!f || !f.type.startsWith('image/')) return;
            bgReplaceImage = f;
            releaseUrl(bgReplaceImageUrl);
            bgReplaceImageUrl = URL.createObjectURL(f);
            document.querySelectorAll('.rbg-bg-swatch').forEach((s) => s.classList.remove('is-active'));
            document.querySelector('.rbg-bg-swatch[data-bg-mode="image"]')?.classList.add('is-active');
            rebuildPreview().catch(() => {});
            e.target.value = '';
        });

        document.getElementById('rbg-download-btn')?.addEventListener('click', () => downloadResult());
        document.getElementById('rbg-reset-btn')?.addEventListener('click', resetAll);
        document.getElementById('rbg-model-retry')?.addEventListener('click', () => {
            modelReady = false;
            ensureModel();
        });

        bindBgSwatches();
    });

    window.__NEXUS_REMOVE_BG_ACTIVATE = ensureModel;
    window.__NEXUS_REMOVE_BG_LOAD_FILE = processFile;
})();
