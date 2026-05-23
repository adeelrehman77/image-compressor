(function () {
    const SHEET_W = 1800;
    const SHEET_H = 1200;
    const SHEET_DPI = 300;
    const BORDER_COLOR = '#E0E0E0';
    const MIN_QUALITY = 0.35;
    const QUALITY_STEP = 0.05;

    const WARNINGS = {
        india:
            '⚠️ ICAO Compliance Rules: Eyeglasses are forbidden. Wear dark or colored clothing to contrast with the solid white background. File size must be under 250 KB.',
        uae:
            '⚠️ Smart Portal Target: Clean white background required. Ideal for direct uploads to MOHRE, ICP, and Dubai Municipality turnstiles.',
    };

    const PRESET_REGION = {
        'india-passport-seva': 'india',
        'india-oci-vfs': 'india',
        'uae-emirates': 'uae',
    };

    const mmToPx = (mm) => Math.round((mm / 25.4) * SHEET_DPI);

    const PRESET_CONFIG = {
        'india-passport-seva': {
            aspect: 7 / 9,
            aspectKey: '7-9',
            export: { w: 630, h: 810, mime: 'image/jpeg', maxBytes: 240 * 1024 },
            print: { photoW: mmToPx(35), photoH: mmToPx(45), cols: 4, rows: 2 },
        },
        'india-oci-vfs': {
            aspect: 1,
            aspectKey: '1-1',
            export: { w: 600, h: 600, mime: 'image/jpeg', maxBytes: 250 * 1024 },
            print: { photoW: 600, photoH: 600, cols: 3, rows: 2 },
        },
        'uae-emirates': {
            aspect: 35 / 45,
            aspectKey: '35-45',
            export: { w: mmToPx(35), h: mmToPx(45), mime: 'image/jpeg', maxBytes: 250 * 1024 },
            print: { photoW: mmToPx(35), photoH: mmToPx(45), cols: 4, rows: 2 },
        },
    };

    const state = {
        bitmap: null,
        objectUrl: null,
        presetId: '',
        zoom: 1,
        panX: 0,
        panY: 0,
        dragging: false,
        dragStart: null,
        croppedPortrait: null,
    };

    const els = {};

    function getPreset() {
        return PRESET_CONFIG[state.presetId] || null;
    }

    function setStatus(msg) {
        if (els.status) els.status.textContent = msg || '';
    }

    function clearBitmap() {
        state.bitmap?.close?.();
        state.bitmap = null;
        if (state.objectUrl) {
            URL.revokeObjectURL(state.objectUrl);
            state.objectUrl = null;
        }
        state.croppedPortrait = null;
    }

    function releaseCanvas(canvas) {
        if (!canvas) return;
        try {
            canvas.width = 0;
            canvas.height = 0;
        } catch {
            /* ignore */
        }
    }

    function updatePassportWarnings() {
        const select = els.presetSelect;
        const warnings = els.warnings;
        if (!select || !warnings) return;

        const region = PRESET_REGION[select.value];
        if (!region || !WARNINGS[region]) {
            warnings.classList.add('is-hidden');
            warnings.textContent = '';
            warnings.removeAttribute('data-region');
            return;
        }

        warnings.textContent = WARNINGS[region];
        warnings.dataset.region = region;
        warnings.classList.remove('is-hidden');
    }

    function applyAspectUI(preset) {
        const key = preset?.aspectKey || '7-9';
        els.previewWrap?.setAttribute('data-aspect', key);
        els.previewStage?.setAttribute('data-aspect', key);
    }

    function computeCoverTransform(srcW, srcH, destW, destH) {
        const base = Math.max(destW / srcW, destH / srcH) * state.zoom;
        const drawW = srcW * base;
        const drawH = srcH * base;
        const x = (destW - drawW) / 2 + state.panX;
        const y = (destH - drawH) / 2 + state.panY;
        return { x, y, drawW, drawH };
    }

    function drawCropToContext(ctx, bitmap, destW, destH) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, destW, destH);
        const { x, y, drawW, drawH } = computeCoverTransform(bitmap.width, bitmap.height, destW, destH);
        ctx.drawImage(bitmap, x, y, drawW, drawH);
    }

    function renderPreview() {
        const preset = getPreset();
        if (!preset || !state.bitmap || !els.previewCanvas || !els.previewWrap) return;

        const rect = els.previewWrap.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cw = Math.max(1, Math.round(rect.width * dpr));
        const ch = Math.max(1, Math.round(rect.height * dpr));
        const canvas = els.previewCanvas;
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        drawCropToContext(ctx, state.bitmap, cw, ch);
    }

    async function canvasToBlob(canvas, mime, quality) {
        if (canvas.convertToBlob) {
            return canvas.convertToBlob({ type: mime, quality });
        }
        return new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), mime, quality);
        });
    }

    async function compressCanvasToLimit(canvas, mime, maxBytes) {
        let best = null;
        for (let q = 0.92; q >= MIN_QUALITY - 0.001; q -= QUALITY_STEP) {
            const rounded = Math.round(q * 100) / 100;
            const blob = await canvasToBlob(canvas, mime, rounded);
            if (!best || blob.size < best.size) best = blob;
            if (blob.size <= maxBytes) return blob;
        }
        return best;
    }

    async function renderDigitalExport() {
        const preset = getPreset();
        if (!preset || !state.bitmap) throw new Error('Load a photo and select a preset first.');

        const { w, h, mime, maxBytes } = preset.export;
        let canvas = null;
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                canvas = new OffscreenCanvas(w, h);
            } else {
                canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
            }
            const ctx = canvas.getContext('2d');
            drawCropToContext(ctx, state.bitmap, w, h);

            let blob = await canvasToBlob(canvas, mime, 0.92);
            if (maxBytes && blob.size > maxBytes) {
                blob = await compressCanvasToLimit(canvas, mime, maxBytes);
            }
            if (maxBytes && blob.size > maxBytes) {
                throw new Error(`Could not compress below ${Math.round(maxBytes / 1024)} KB — try a simpler background.`);
            }
            return blob;
        } finally {
            releaseCanvas(canvas);
        }
    }

    async function refreshCroppedPortrait() {
        state.croppedPortrait = await renderDigitalExport();
        return state.croppedPortrait;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function generatePrintSheet() {
        const preset = getPreset();
        if (!preset || !state.bitmap) throw new Error('Load a photo and select a preset first.');

        const portrait = state.croppedPortrait || (await refreshCroppedPortrait());
        const portraitBitmap = await createImageBitmap(portrait);
        const { photoW, photoH, cols, rows } = preset.print;

        const gridW = cols * photoW;
        const gridH = rows * photoH;
        const offsetX = Math.round((SHEET_W - gridW) / 2);
        const offsetY = Math.round((SHEET_H - gridH) / 2);

        let sheet = null;
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                sheet = new OffscreenCanvas(SHEET_W, SHEET_H);
            } else {
                sheet = document.createElement('canvas');
                sheet.width = SHEET_W;
                sheet.height = SHEET_H;
            }
            const ctx = sheet.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, SHEET_W, SHEET_H);

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const x = offsetX + col * photoW;
                    const y = offsetY + row * photoH;
                    ctx.drawImage(portraitBitmap, x, y, photoW, photoH);
                    ctx.strokeStyle = BORDER_COLOR;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 0.5, y + 0.5, photoW - 1, photoH - 1);
                }
            }

            const blob = await canvasToBlob(sheet, 'image/jpeg', 0.95);
            downloadBlob(blob, `passport-print-sheet-4x6-${state.presetId}.jpg`);
            setStatus(`4×6 sheet ready — ${cols * rows} photos at ${SHEET_DPI} DPI (${SHEET_W}×${SHEET_H} px).`);
        } finally {
            portraitBitmap.close();
            releaseCanvas(sheet);
        }
    }

    function clearPassportPhoto() {
        clearBitmap();
        resetTransform();
        releaseCanvas(els.previewCanvas);
        showEditor(false);
        setStatus('Photo cleared. Choose another portrait when ready.');
    }

    function showEditor(show) {
        els.dropZone?.classList.toggle('is-hidden', show);
        els.editor?.classList.toggle('is-hidden', !show);
        document.getElementById('passport-sidebar-crop')?.classList.toggle('is-hidden', !show);
        document.getElementById('passport-sidebar-export')?.classList.toggle('is-hidden', !show);
        if (show) {
            els.biometricOverlay?.classList.remove('is-hidden');
            requestAnimationFrame(renderPreview);
        }
    }

    function resetTransform() {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        if (els.zoom) els.zoom.value = '1';
    }

    async function onPhotoSelected(file) {
        if (!file) return;
        if (!state.presetId) {
            setStatus('Select a preset first, then choose your photo.');
            return;
        }

        clearBitmap();
        state.objectUrl = URL.createObjectURL(file);
        state.bitmap = await createImageBitmap(file);
        resetTransform();
        showEditor(true);
        setStatus(`${file.name} loaded — align face within the circle, then export.`);
        renderPreview();
    }

    function onPresetChange() {
        state.presetId = els.presetSelect?.value || '';
        updatePassportWarnings();
        const preset = getPreset();
        applyAspectUI(preset);

        if (state.presetId === 'india-passport-seva' && preset) {
            const ratio = preset.export.w / preset.export.h;
            if (Math.abs(ratio - 7 / 9) > 0.001) {
                console.warn('Passport Seva aspect validation failed');
            }
        }

        state.croppedPortrait = null;
        resetTransform();
        if (state.bitmap) renderPreview();
    }

    function onPanStart(clientX, clientY) {
        if (!state.bitmap) return;
        state.dragging = true;
        state.dragStart = { x: clientX, y: clientY, panX: state.panX, panY: state.panY };
        els.previewWrap?.classList.add('is-dragging');
    }

    function onPanMove(clientX, clientY) {
        if (!state.dragging || !state.dragStart) return;
        const scale = (els.previewWrap?.getBoundingClientRect().width || 1) / (getPreset()?.export.w || 630);
        state.panX = state.dragStart.panX + (clientX - state.dragStart.x) / scale;
        state.panY = state.dragStart.panY + (clientY - state.dragStart.y) / scale;
        renderPreview();
    }

    function onPanEnd() {
        state.dragging = false;
        state.dragStart = null;
        els.previewWrap?.classList.remove('is-dragging');
    }

    function bindPassportStudio() {
        els.presetSelect = document.getElementById('passport-preset-select');
        els.warnings = document.getElementById('passport-warnings');
        els.input = document.getElementById('passport-photo-input');
        els.status = document.getElementById('passport-studio-status');
        els.dropZone = document.getElementById('passport-drop-zone');
        els.editor = document.getElementById('passport-editor');
        els.previewStage = document.getElementById('passport-preview-stage');
        els.previewWrap = document.getElementById('passport-preview-wrap');
        els.previewCanvas = document.getElementById('passport-preview-canvas');
        els.biometricOverlay = document.getElementById('passport-biometric-overlay');
        els.zoom = document.getElementById('passport-zoom');
        els.exportBtn = document.getElementById('passport-export-digital');
        els.printBtn = document.getElementById('passport-print-sheet');
        els.clearBtn = document.getElementById('passport-clear-photo');
        els.replaceInput = document.getElementById('passport-photo-replace');

        els.presetSelect?.addEventListener('change', onPresetChange);

        els.input?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) onPhotoSelected(file);
            e.target.value = '';
        });

        els.replaceInput?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) onPhotoSelected(file);
            e.target.value = '';
        });

        els.clearBtn?.addEventListener('click', clearPassportPhoto);

        window.NexusTools?.bindDropZone?.(els.dropZone, els.input, (files) => {
            const file = [...files].find((f) => /^image\/(jpeg|png|webp)$/i.test(f.type));
            if (file) onPhotoSelected(file);
            else if (files.length) setStatus('Drop a JPEG, PNG, or WebP portrait photo.');
        });

        els.zoom?.addEventListener('input', (e) => {
            state.zoom = parseFloat(e.target.value) || 1;
            renderPreview();
        });

        els.previewWrap?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            onPanStart(e.clientX, e.clientY);
        });
        window.addEventListener('mousemove', (e) => onPanMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onPanEnd);

        els.previewWrap?.addEventListener(
            'touchstart',
            (e) => {
                const t = e.touches[0];
                if (t) onPanStart(t.clientX, t.clientY);
            },
            { passive: true }
        );
        els.previewWrap?.addEventListener(
            'touchmove',
            (e) => {
                const t = e.touches[0];
                if (t) onPanMove(t.clientX, t.clientY);
            },
            { passive: true }
        );
        els.previewWrap?.addEventListener('touchend', onPanEnd);

        window.addEventListener('resize', () => {
            if (state.bitmap) renderPreview();
        });

        els.exportBtn?.addEventListener('click', async () => {
            els.exportBtn.disabled = true;
            try {
                const blob = await refreshCroppedPortrait();
                const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
                const kb = (blob.size / 1024).toFixed(1);
                downloadBlob(blob, `passport-digital-${state.presetId}.${ext}`);
                setStatus(`Digital export saved (${kb} KB).`);
            } catch (err) {
                setStatus(err.message || 'Export failed.');
                window.NexusSentry?.captureException?.(err, { tool: 'passport-studio', action: 'export' });
            } finally {
                els.exportBtn.disabled = false;
            }
        });

        els.printBtn?.addEventListener('click', async () => {
            els.printBtn.disabled = true;
            try {
                await generatePrintSheet();
            } catch (err) {
                setStatus(err.message || 'Print sheet failed.');
                window.NexusSentry?.captureException?.(err, { tool: 'passport-studio', action: 'print-sheet' });
            } finally {
                els.printBtn.disabled = false;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindPassportStudio);
    } else {
        bindPassportStudio();
    }

    window.NexusPassportStudio = { updatePassportWarnings, generatePrintSheet, renderDigitalExport };
})();
