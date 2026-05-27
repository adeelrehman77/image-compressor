(function () {
    'use strict';

    const { toast, formatBytes, downloadBlob, bindDropZone, runWhenReady, loadPdfJs } = window.NexusTools;

    const PRESETS = {
        'emirates-id-front': {
            'ID Number': { x: 0.52, y: 0.58, w: 0.4, h: 0.1 },
            'Date of Birth': { x: 0.52, y: 0.7, w: 0.3, h: 0.1 },
            'Name (Arabic)': { x: 0.52, y: 0.35, w: 0.4, h: 0.12 },
        },
        'emirates-id-back': {
            'MRZ Line 1': { x: 0.01, y: 0.72, w: 0.98, h: 0.12 },
            'MRZ Line 2': { x: 0.01, y: 0.84, w: 0.98, h: 0.12 },
        },
        'uae-passport': {
            'Passport Number': { x: 0.55, y: 0.18, w: 0.38, h: 0.08 },
            'Date of Birth': { x: 0.55, y: 0.52, w: 0.25, h: 0.08 },
            'National ID': { x: 0.55, y: 0.62, w: 0.35, h: 0.08 },
            'MRZ Line 1': { x: 0, y: 0.82, w: 1, h: 0.09 },
            'MRZ Line 2': { x: 0, y: 0.91, w: 1, h: 0.09 },
        },
        'uae-residence-visa': {
            'UID Number': { x: 0.05, y: 0.12, w: 0.45, h: 0.08 },
            'Passport Number': { x: 0.05, y: 0.24, w: 0.4, h: 0.08 },
            'File Number': { x: 0.52, y: 0.12, w: 0.42, h: 0.08 },
        },
        'tenancy-contract': {
            'Tenant ID': { x: 0.08, y: 0.22, w: 0.38, h: 0.06 },
            'Landlord ID': { x: 0.08, y: 0.3, w: 0.38, h: 0.06 },
            'Passport Number': { x: 0.5, y: 0.22, w: 0.4, h: 0.06 },
        },
        'bank-statement': {
            'Account Number': { x: 0.08, y: 0.18, w: 0.45, h: 0.07 },
            'IBAN': { x: 0.08, y: 0.28, w: 0.75, h: 0.07 },
        },
        'salary-certificate': {
            'Employee ID': { x: 0.55, y: 0.2, w: 0.38, h: 0.07 },
            'Bank Account': { x: 0.08, y: 0.55, w: 0.5, h: 0.07 },
            'Salary Amount': { x: 0.55, y: 0.55, w: 0.35, h: 0.07 },
        },
    };

    const PRESET_FIELD_I18N = {
        'ID Number': 'rdFieldIdNumber',
        'Date of Birth': 'rdFieldDob',
        'Name (Arabic)': 'rdFieldNameAr',
        'Passport Number': 'rdFieldPassport',
        'National ID': 'rdFieldNationalId',
        'MRZ Line 1': 'rdFieldMrz1',
        'MRZ Line 2': 'rdFieldMrz2',
        'UID Number': 'rdFieldUid',
        'File Number': 'rdFieldFileNo',
        'Tenant ID': 'rdFieldTenantId',
        'Landlord ID': 'rdFieldLandlordId',
        'Account Number': 'rdFieldAccount',
        IBAN: 'rdFieldIban',
        'Employee ID': 'rdFieldEmployeeId',
        'Bank Account': 'rdFieldBankAccount',
        'Salary Amount': 'rdFieldSalary',
    };

    const COMPRESS_PORTALS = {
        ica: 200,
        mohre: 500,
    };

    let sourceCanvas = null;
    let sourceFromPdf = false;
    let baseFileName = 'document';
    let displayScale = 1;
    let boxes = [];
    let undoStack = [];
    let redoStack = [];
    let selectedBoxId = null;
    let dragState = null;
    let mobileDrawMode = true;
    let boxIdSeq = 0;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    function canvasSupported() {
        try {
            const c = document.createElement('canvas');
            return !!(c.getContext && c.getContext('2d'));
        } catch {
            return false;
        }
    }

    function nextBoxId() {
        boxIdSeq += 1;
        return `rd-box-${boxIdSeq}`;
    }

    function pushUndo() {
        undoStack.push(JSON.stringify(boxes));
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
        syncUndoButtons();
    }

    function restoreBoxes(json) {
        boxes = JSON.parse(json);
        redrawDisplay();
    }

    function syncUndoButtons() {
        const undo = document.getElementById('rd-undo-btn');
        const redo = document.getElementById('rd-redo-btn');
        if (undo) undo.disabled = undoStack.length === 0;
        if (redo) redo.disabled = redoStack.length === 0;
    }

    function imageSize() {
        return { w: sourceCanvas.width, h: sourceCanvas.height };
    }

    function displaySize() {
        const { w, h } = imageSize();
        return { w: Math.round(w * displayScale), h: Math.round(h * displayScale) };
    }

    function toImageCoords(dx, dy, dw, dh) {
        return {
            x: Math.round(dx / displayScale),
            y: Math.round(dy / displayScale),
            w: Math.max(1, Math.round(dw / displayScale)),
            h: Math.max(1, Math.round(dh / displayScale)),
        };
    }

    function toDisplayCoords(box) {
        return {
            x: box.x * displayScale,
            y: box.y * displayScale,
            w: box.w * displayScale,
            h: box.h * displayScale,
        };
    }

    function clampBox(b, imgW, imgH) {
        let x = Math.max(0, Math.min(b.x, imgW - 1));
        let y = Math.max(0, Math.min(b.y, imgH - 1));
        let w = Math.max(1, Math.min(b.w, imgW - x));
        let h = Math.max(1, Math.min(b.h, imgH - y));
        return { ...b, x, y, w, h };
    }

    function computeDisplayScale() {
        const wrap = document.getElementById('rd-stage-wrap');
        const maxW = (wrap?.clientWidth || 720) - 16;
        const maxH = Math.min(window.innerHeight * 0.55, 640);
        const { w, h } = imageSize();
        displayScale = Math.min(maxW / w, maxH / h, 1);
        if (!Number.isFinite(displayScale) || displayScale <= 0) displayScale = 1;
    }

    function getDisplayCanvas() {
        return document.getElementById('rd-display');
    }

    function redrawDisplay() {
        const canvas = getDisplayCanvas();
        if (!canvas || !sourceCanvas) return;
        const { w: dw, h: dh } = displaySize();
        canvas.width = dw;
        canvas.height = dh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(sourceCanvas, 0, 0, dw, dh);
        boxes.forEach((box) => {
            const d = toDisplayCoords(box);
            if (box.mode === 'blur') {
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(d.x, d.y, d.w, d.h);
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
                ctx.font = '11px system-ui,sans-serif';
                ctx.fillStyle = '#fff';
                ctx.fillText('Blur', d.x + 4, d.y + 14);
            } else {
                ctx.fillStyle = '#000000';
                ctx.fillRect(d.x, d.y, d.w, d.h);
            }
            if (box.id === selectedBoxId) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2;
                ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
            }
        });
        if (dragState?.rubber) {
            const r = dragState.rubber;
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.setLineDash([]);
        }
    }

    function boxBlurPass(data, w, h, radius) {
        const out = new Uint8ClampedArray(data);
        const tmp = new Uint8ClampedArray(data.length);
        const r = Math.max(1, Math.round(radius));
        const div = 2 * r + 1;

        for (let pass = 0; pass < 3; pass++) {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let sr = 0;
                    let sg = 0;
                    let sb = 0;
                    let sa = 0;
                    for (let k = -r; k <= r; k++) {
                        const cx = Math.min(w - 1, Math.max(0, x + k));
                        const i = (y * w + cx) * 4;
                        const src = pass === 0 ? data : tmp;
                        sr += src[i];
                        sg += src[i + 1];
                        sb += src[i + 2];
                        sa += src[i + 3];
                    }
                    const o = (y * w + x) * 4;
                    out[o] = sr / div;
                    out[o + 1] = sg / div;
                    out[o + 2] = sb / div;
                    out[o + 3] = sa / div;
                }
            }
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let sr = 0;
                    let sg = 0;
                    let sb = 0;
                    let sa = 0;
                    for (let k = -r; k <= r; k++) {
                        const cy = Math.min(h - 1, Math.max(0, y + k));
                        const i = (cy * w + x) * 4;
                        sr += out[i];
                        sg += out[i + 1];
                        sb += out[i + 2];
                        sa += out[i + 3];
                    }
                    const o = (y * w + x) * 4;
                    tmp[o] = sr / div;
                    tmp[o + 1] = sg / div;
                    tmp[o + 2] = sb / div;
                    tmp[o + 3] = sa / div;
                }
            }
            data.set(tmp);
        }
        return data;
    }

    function applyRedactionsToCanvas(targetCanvas) {
        const ctx = targetCanvas.getContext('2d');
        ctx.drawImage(sourceCanvas, 0, 0);
        const { w, h } = imageSize();
        boxes.forEach((box) => {
            const b = clampBox(box, w, h);
            if (box.mode === 'blur') {
                const img = ctx.getImageData(b.x, b.y, b.w, b.h);
                img.data.set(boxBlurPass(img.data, b.w, b.h, 4));
                ctx.putImageData(img, b.x, b.y);
            } else {
                ctx.fillStyle = '#000000';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        });
    }

    function renderFullResolution() {
        const { w, h } = imageSize();
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        applyRedactionsToCanvas(off);
        return off;
    }

    async function exportBlob(format, quality) {
        const off = renderFullResolution();
        const mime = format === 'image/png' ? 'image/png' : 'image/jpeg';
        const q = quality ?? 0.9;
        if (off.convertToBlob) {
            return off.convertToBlob({ type: mime, quality: q });
        }
        return new Promise((resolve, reject) => {
            off.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), mime, q);
        });
    }

    function compressBlobWithWorker(blob, targetSizeKb) {
        return new Promise((resolve, reject) => {
            const workerUrl =
                window.NexusTools?.assetUrl?.('js/compress-worker.mjs') || 'js/compress-worker.mjs';
            const w = new Worker(workerUrl, { type: 'module' });
            const id = `rd-${Date.now()}`;
            w.onmessage = (e) => {
                if (e.data.id !== id) return;
                w.terminate();
                if (e.data.success) resolve(e.data.blob);
                else reject(new Error(e.data.error || 'Compression failed'));
            };
            w.onerror = () => {
                w.terminate();
                reject(new Error('Compression worker error'));
            };
            const file = new File([blob], `${baseFileName}-redacted.jpg`, { type: 'image/jpeg' });
            w.postMessage({
                id,
                file,
                config: {
                    quality: 0.9,
                    format: 'image/jpeg',
                    targetSizeKb,
                    fixOrientation: false,
                    maxWidth: 4096,
                    maxHeight: 4096,
                },
            });
        });
    }

    function showEditor(show) {
        document.getElementById('rd-drop-zone')?.classList.toggle('is-hidden', show);
        document.getElementById('rd-editor')?.classList.toggle('is-hidden', !show);
        document.getElementById('rd-export-card')?.classList.toggle('is-hidden', !show);
        document.getElementById('rd-pdf-note')?.classList.toggle('is-hidden', !show || !sourceFromPdf);
    }

    function resetDocument() {
        sourceCanvas = null;
        sourceFromPdf = false;
        boxes = [];
        undoStack = [];
        redoStack = [];
        selectedBoxId = null;
        dragState = null;
        showEditor(false);
        hideBoxMenu();
        document.getElementById('rd-file-size')?.classList.add('is-hidden');
        syncUndoButtons();
    }

    async function loadImageFile(file) {
        const bitmap = await createImageBitmap(file);
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = bitmap.width;
        sourceCanvas.height = bitmap.height;
        sourceCanvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close();
        sourceFromPdf = false;
        baseFileName = (file.name || 'document').replace(/\.[^.]+$/, '');
    }

    async function loadPdfFile(file) {
        const pdfjs = await loadPdfJs();
        const data = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        page.cleanup();
        await pdf.destroy();
        sourceCanvas = canvas;
        sourceFromPdf = true;
        baseFileName = (file.name || 'document').replace(/\.pdf$/i, '');
    }

    async function handleFile(file) {
        if (!file) return;
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImg =
            /^image\/(jpeg|png)$/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name || '');
        if (!isPdf && !isImg) {
            toast(tf('rdNeedFormat', null, 'Please use JPEG, PNG, or PDF.'), 'warn');
            return;
        }
        try {
            if (isPdf) await loadPdfFile(file);
            else await loadImageFile(file);
            boxes = [];
            undoStack = [];
            redoStack = [];
            computeDisplayScale();
            showEditor(true);
            const stage = document.getElementById('rd-stage');
            const { w: dw, h: dh } = displaySize();
            if (stage) {
                stage.style.width = `${dw}px`;
                stage.style.height = `${dh}px`;
            }
            redrawDisplay();
            syncUndoButtons();
            rebuildPresetButtons();
            toast(tf('rdLoaded', { name: file.name }, `${file.name} loaded — draw redaction boxes.`), 'info');
        } catch (err) {
            window.NexusSentry?.captureException?.(err, { tool: 'redactor', action: 'load' });
            toast(tf('rdLoadFail', null, 'Could not load document.'), 'error');
        }
    }

    function pointerPos(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches?.[0]?.clientX ?? e.clientX;
        const clientY = e.touches?.[0]?.clientY ?? e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    }

    function canDrawNow() {
        const mq = window.matchMedia('(max-width: 780px)');
        return !mq.matches || mobileDrawMode;
    }

    function onPointerDown(e) {
        if (!sourceCanvas || !canDrawNow()) return;
        if (e.target.closest('.rd-box-menu, .rd-bottom-sheet')) return;
        const canvas = getDisplayCanvas();
        if (!canvas || e.target !== canvas) return;
        e.preventDefault();
        hideBoxMenu();
        const p = pointerPos(e, canvas);
        dragState = { startX: p.x, startY: p.y, rubber: { x: p.x, y: p.y, w: 0, h: 0 } };
        selectedBoxId = null;
    }

    function onPointerMove(e) {
        if (!dragState?.rubber) return;
        e.preventDefault();
        const canvas = getDisplayCanvas();
        const p = pointerPos(e, canvas);
        const x = Math.min(dragState.startX, p.x);
        const y = Math.min(dragState.startY, p.y);
        const w = Math.abs(p.x - dragState.startX);
        const h = Math.abs(p.y - dragState.startY);
        dragState.rubber = { x, y, w, h };
        redrawDisplay();
    }

    function onPointerUp(e) {
        if (!dragState?.rubber) return;
        const r = dragState.rubber;
        dragState = null;
        if (r.w < 6 || r.h < 6) {
            redrawDisplay();
            return;
        }
        const img = toImageCoords(r.x, r.y, r.w, r.h);
        const { w: iw, h: ih } = imageSize();
        pushUndo();
        const box = clampBox(
            { id: nextBoxId(), x: img.x, y: img.y, w: img.w, h: img.h, mode: 'black' },
            iw,
            ih
        );
        boxes.push(box);
        selectedBoxId = box.id;
        redrawDisplay();
        showBoxMenu(box, r.x + r.w / 2, r.y);
    }

    function findBoxAtDisplay(dx, dy) {
        for (let i = boxes.length - 1; i >= 0; i--) {
            const d = toDisplayCoords(boxes[i]);
            if (dx >= d.x && dx <= d.x + d.w && dy >= d.y && dy <= d.y + d.h) return boxes[i];
        }
        return null;
    }

    function showBoxMenu(box, anchorX, anchorY) {
        selectedBoxId = box.id;
        redrawDisplay();
        const isMobile = window.matchMedia('(max-width: 780px)').matches;
        const menu = document.getElementById('rd-box-menu');
        const sheet = document.getElementById('rd-bottom-sheet');
        if (isMobile && sheet) {
            sheet.classList.remove('is-hidden');
            sheet.dataset.boxId = box.id;
            menu?.classList.add('is-hidden');
            return;
        }
        if (menu) {
            menu.classList.remove('is-hidden');
            menu.dataset.boxId = box.id;
            const wrap = document.getElementById('rd-stage-wrap');
            const wrapRect = wrap?.getBoundingClientRect();
            if (wrapRect) {
                menu.style.left = `${Math.min(anchorX, wrapRect.width - 140)}px`;
                menu.style.top = `${Math.max(8, anchorY - 8)}px`;
            }
        }
        sheet?.classList.add('is-hidden');
    }

    function hideBoxMenu() {
        document.getElementById('rd-box-menu')?.classList.add('is-hidden');
        document.getElementById('rd-bottom-sheet')?.classList.add('is-hidden');
    }

    function setBoxMode(boxId, mode) {
        const box = boxes.find((b) => b.id === boxId);
        if (!box) return;
        pushUndo();
        box.mode = mode;
        redrawDisplay();
        hideBoxMenu();
    }

    function deleteBox(boxId) {
        pushUndo();
        boxes = boxes.filter((b) => b.id !== boxId);
        if (selectedBoxId === boxId) selectedBoxId = null;
        redrawDisplay();
        hideBoxMenu();
    }

    function applyPresetField(fieldKey) {
        const docType = document.getElementById('rd-doc-type')?.value;
        const preset = PRESETS[docType];
        if (!preset || !preset[fieldKey] || !sourceCanvas) return;
        const p = preset[fieldKey];
        const { w: iw, h: ih } = imageSize();
        pushUndo();
        const box = clampBox(
            {
                id: nextBoxId(),
                x: Math.round(p.x * iw),
                y: Math.round(p.y * ih),
                w: Math.max(1, Math.round(p.w * iw)),
                h: Math.max(1, Math.round(p.h * ih)),
                mode: 'black',
            },
            iw,
            ih
        );
        boxes.push(box);
        redrawDisplay();
        const d = toDisplayCoords(box);
        showBoxMenu(box, d.x + d.w / 2, d.y);
    }

    function rebuildPresetButtons() {
        const host = document.getElementById('rd-preset-buttons');
        if (!host) return;
        const docType = document.getElementById('rd-doc-type')?.value;
        const preset = PRESETS[docType] || {};
        host.innerHTML = '';
        Object.keys(preset).forEach((field) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-secondary btn-sm btn-block rd-preset-btn';
            const i18nKey = PRESET_FIELD_I18N[field];
            btn.textContent = i18nKey ? tf(i18nKey, null, field) : field;
            btn.addEventListener('click', () => applyPresetField(field));
            host.appendChild(btn);
        });
    }

    function openPreviewModal(blobUrl) {
        const modal = document.getElementById('rd-preview-modal');
        const img = document.getElementById('rd-preview-img');
        if (!modal || !img) return;
        img.src = blobUrl;
        modal.classList.remove('is-hidden');
        modal.hidden = false;
        document.body.classList.add('modal-open');
    }

    function closePreviewModal() {
        const modal = document.getElementById('rd-preview-modal');
        const img = document.getElementById('rd-preview-img');
        if (!modal) return;
        modal.classList.add('is-hidden');
        modal.hidden = true;
        if (img?.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
        img.src = '';
        document.body.classList.remove('modal-open');
    }

    async function getExportBlob() {
        const format = document.getElementById('rd-output-format')?.value || 'image/jpeg';
        const quality = format === 'image/jpeg' ? 0.9 : undefined;
        let blob = await exportBlob(format, quality);
        const compressOn = document.getElementById('rd-compress-toggle')?.checked;
        if (compressOn) {
            const portal = document.getElementById('rd-compress-portal')?.value || 'ica';
            const targetKb = COMPRESS_PORTALS[portal] || 200;
            blob = await compressBlobWithWorker(blob, targetKb);
        }
        return { blob, format };
    }

    async function previewRedacted() {
        if (!sourceCanvas) return;
        try {
            const { blob } = await getExportBlob();
            openPreviewModal(URL.createObjectURL(blob));
        } catch (err) {
            toast(tf('rdPreviewFail', null, 'Preview failed.'), 'error');
        }
    }

    async function downloadRedacted() {
        if (!sourceCanvas) return;
        const btn = document.getElementById('rd-download-btn');
        if (btn) btn.disabled = true;
        try {
            const { blob, format } = await getExportBlob();
            const ext = format === 'image/png' ? 'png' : 'jpg';
            downloadBlob(blob, `${baseFileName}-redacted.${ext}`, 'redactor');
            const sizeEl = document.getElementById('rd-file-size');
            if (sizeEl) {
                sizeEl.textContent = tf(
                    'rdFileSize',
                    { size: formatBytes(blob.size) },
                    `Redacted file: ${formatBytes(blob.size)}`
                );
                sizeEl.classList.remove('is-hidden');
            }
        } catch (err) {
            window.NexusSentry?.captureException?.(err, { tool: 'redactor', action: 'download' });
            toast(tf('rdDownloadFail', null, 'Download failed.'), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function bindCanvasEvents() {
        const canvas = getDisplayCanvas();
        if (!canvas) return;
        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        canvas.addEventListener('touchmove', onPointerMove, { passive: false });
        canvas.addEventListener('touchend', onPointerUp);
        canvas.addEventListener('dblclick', (e) => {
            const p = pointerPos(e, canvas);
            const hit = findBoxAtDisplay(p.x, p.y);
            if (hit) showBoxMenu(hit, p.x, p.y);
        });
    }

    function bindUi() {
        if (!canvasSupported()) {
            document.getElementById('rd-unsupported')?.classList.remove('is-hidden');
            document.getElementById('rd-drop-zone')?.classList.add('is-hidden');
            return;
        }

        const dropZone = document.getElementById('rd-drop-zone');
        const fileInput = document.getElementById('rd-file-input');
        bindDropZone(dropZone, fileInput, (files) => {
            const f = [...files][0];
            if (f) handleFile(f);
        });
        fileInput?.addEventListener('change', () => {
            const f = fileInput.files?.[0];
            if (f) handleFile(f);
            fileInput.value = '';
        });

        document.getElementById('rd-undo-btn')?.addEventListener('click', () => {
            if (!undoStack.length) return;
            redoStack.push(JSON.stringify(boxes));
            restoreBoxes(undoStack.pop());
            syncUndoButtons();
        });
        document.getElementById('rd-redo-btn')?.addEventListener('click', () => {
            if (!redoStack.length) return;
            undoStack.push(JSON.stringify(boxes));
            restoreBoxes(redoStack.pop());
            syncUndoButtons();
        });
        document.getElementById('rd-clear-btn')?.addEventListener('click', () => {
            if (!boxes.length) return;
            if (!window.confirm(tf('rdConfirmClear', null, 'Remove all redaction boxes?'))) return;
            pushUndo();
            boxes = [];
            selectedBoxId = null;
            redrawDisplay();
            hideBoxMenu();
        });

        document.getElementById('rd-doc-type')?.addEventListener('change', rebuildPresetButtons);

        document.getElementById('rd-mode-toggle')?.addEventListener('click', () => {
            mobileDrawMode = !mobileDrawMode;
            const wrap = document.getElementById('rd-stage-wrap');
            const btn = document.getElementById('rd-mode-toggle');
            if (wrap) {
                wrap.classList.toggle('rd-stage-wrap--zoom', !mobileDrawMode);
                wrap.classList.toggle('rd-stage-wrap--draw', mobileDrawMode);
            }
            if (btn) {
                btn.textContent = mobileDrawMode
                    ? tf('rdModeDraw', null, 'Draw mode')
                    : tf('rdModeZoom', null, 'Zoom mode');
            }
        });

        document.querySelectorAll('[data-rd-box-action]').forEach((el) => {
            el.addEventListener('click', () => {
                const action = el.dataset.rdBoxAction;
                const id =
                    document.getElementById('rd-bottom-sheet')?.dataset.boxId ||
                    document.getElementById('rd-box-menu')?.dataset.boxId;
                if (action === 'black') setBoxMode(id, 'black');
                else if (action === 'blur') setBoxMode(id, 'blur');
                else if (action === 'delete') deleteBox(id);
            });
        });

        const compressToggle = document.getElementById('rd-compress-toggle');
        const compressPortal = document.getElementById('rd-compress-portal');
        const syncCompressUi = () => {
            compressPortal?.classList.toggle('is-hidden', !compressToggle?.checked);
        };
        compressToggle?.addEventListener('change', syncCompressUi);
        syncCompressUi();

        document.getElementById('rd-preview-btn')?.addEventListener('click', previewRedacted);
        document.getElementById('rd-download-btn')?.addEventListener('click', downloadRedacted);
        document.getElementById('rd-new-doc-btn')?.addEventListener('click', resetDocument);

        document.getElementById('rd-preview-modal')?.addEventListener('click', (e) => {
            if (e.target.closest('[data-rd-preview-close]')) closePreviewModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closePreviewModal();
        });

        window.addEventListener('resize', () => {
            if (!sourceCanvas) return;
            computeDisplayScale();
            const stage = document.getElementById('rd-stage');
            const { w: dw, h: dh } = displaySize();
            if (stage) {
                stage.style.width = `${dw}px`;
                stage.style.height = `${dh}px`;
            }
            redrawDisplay();
        });

        bindCanvasEvents();
        rebuildPresetButtons();
    }

    runWhenReady(bindUi);
    window.__NEXUS_REDACTOR_LOAD_FILE = handleFile;
})();
