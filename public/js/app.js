(function () {
    const STORAGE_KEY = 'nexuscompress-settings';
    const HISTORY_KEY = 'nexuscompress-history';
    const WORKER_POOL_SIZE = 3;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const MAX_BATCH_FILES = 20;
    const ACCEPTED_TYPES = /^image\/(jpeg|png|webp|avif)$/i;
    const ACCEPTED_EXT = /\.(jpe?g|png|webp|avif)$/i;

    function tf(key, vars, fallback) {
        var s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        if (s) return s;
        if (fallback != null) return fallback;
        return window.__NEXUS_T?.(key) || key;
    }

    const PRESETS = {
        web: { quality: 85, format: 'image/webp', maxWidth: 1920, maxHeight: null, targetSizeKb: null },
        email: { quality: 70, format: 'image/jpeg', maxWidth: 1200, maxHeight: null, targetSizeKb: null },
        social: { quality: 80, format: 'image/jpeg', maxWidth: 1080, maxHeight: null, targetSizeKb: null },
        max: { quality: 95, format: 'image/png', maxWidth: null, maxHeight: null, targetSizeKb: null },
    };

    const UAE_PRESETS = {
        'emirates-id': {
            quality: 80,
            format: 'image/jpeg',
            maxWidth: 1600,
            maxHeight: null,
            targetSizeKb: 200,
            scalePercent: 100,
            aspectRatio: '',
        },
        'ica-upload': {
            quality: 80,
            format: 'image/jpeg',
            maxWidth: 1600,
            maxHeight: null,
            targetSizeKb: 200,
            scalePercent: 100,
            aspectRatio: '',
        },
        'mohre-portal': {
            quality: 75,
            format: 'image/jpeg',
            maxWidth: 1920,
            maxHeight: null,
            targetSizeKb: 500,
            scalePercent: 100,
            aspectRatio: '',
        },
        'rta-docs': {
            quality: 75,
            format: 'image/jpeg',
            maxWidth: 1920,
            maxHeight: null,
            targetSizeKb: 500,
            scalePercent: 100,
            aspectRatio: '',
        },
        'portal-reg': {
            quality: 85,
            format: 'image/webp',
            maxWidth: 1920,
            maxHeight: null,
            targetSizeKb: 500,
            scalePercent: 100,
            aspectRatio: '',
        },
    };

    const state = {
        tasks: new Map(),
        compressedFiles: new Map(),
        objectUrls: new Map(),
        queue: [],
        activeWorkers: 0,
        viewMode: 'cards',
        avifSupported: false,
        cancelled: false,
        sequentialMode: false,
        zipAbort: false,
        zipGeneration: 0,
        watermarkLogo: null,
        selectedTaskId: null,
    };

    const workers = [];
    const els = {};
    let compareModalCleanup = null;
    let compareModalEscapeHandler = null;
    let previewCompareCleanup = null;

    document.addEventListener('DOMContentLoaded', init);

    function hideFolderPickerOnIos() {
        const ios =
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (ios) document.getElementById('folder-input-label')?.classList.add('is-hidden');
    }

    function init() {
        cacheElements();
        initCompareModal();
        detectAvif();
        initWorkers();
        loadSettings();
        bindEvents();
        hideFolderPickerOnIos();
        window.__NEXUS_COMPRESS_ADD_FILES = handleFiles;
        window.__NEXUS_SYNC_UAE_BUTTONS = syncPresetButtons;
        syncPresetButtons();
        applyTheme(localStorage.getItem('nexus-theme') || 'dark');
        scheduleIdle(registerServiceWorker, 6000);
        loadVersion();
        const yearEl = document.getElementById('footer-year');
        if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    }

    function scheduleIdle(fn, timeout = 3000) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(fn, { timeout });
        } else {
            window.addEventListener('load', () => setTimeout(fn, 1500));
        }
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (local) return;
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    async function loadVersion() {
        const el = document.getElementById('app-version');
        const heroBadge = document.getElementById('compress-version-badge');
        if (!el && !heroBadge) return;
        try {
            const res = await fetch(`version.json?${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const { version, buildId } = data;
                const label = buildId ? `v${version} (${buildId})` : `v${version}`;
                if (el) {
                    el.textContent = label;
                    el.title = data.builtAt ? `Built ${data.builtAt}` : '';
                }
                if (heroBadge) {
                    heroBadge.textContent = `${label} — ${tf('badgeFree', null, 'Free')}`;
                    heroBadge.title = data.builtAt || '';
                }
                document.documentElement.dataset.appVersion = version;
                document.documentElement.dataset.buildId = buildId || '';
                window.NexusSentry?.setAppVersion?.(`${version}+${buildId || 'local'}`);
            }
        } catch {
            if (el) el.textContent = 'v2';
            if (heroBadge) heroBadge.textContent = `v2 — ${tf('badgeFree', null, 'Free')}`;
        }
    }

    function cacheElements() {
        [
            'drop-zone', 'file-input', 'folder-input', 'quality', 'quality-val', 'format',
            'max-width', 'max-height', 'scale-percent', 'aspect-ratio', 'preset', 'uae-preset',
            'target-size-value', 'target-size-unit', 'target-size-kb', 'rename-pattern', 'fix-orientation',
            'watermark-enabled', 'watermark-type', 'watermark-text', 'watermark-logo', 'watermark-position',
            'watermark-opacity', 'watermark-opacity-val', 'watermark-fields',
            'results-container', 'results-list', 'results-table-wrap',
            'results-table-body', 'download-all-btn', 'clear-all-btn', 'batch-summary',
            'batch-count', 'batch-saved', 'batch-avg', 'batch-progress-bar', 'batch-progress',
            'zip-progress-wrap', 'zip-progress-bar', 'zip-progress-label', 'zip-progress-pct', 'zip-cancel',
            'memory-guard-notice', 'memory-guard-dismiss', 'view-toggle-wrap',
            'view-cards', 'view-table', 'theme-toggle', 'toast-root',
            'start-compress-btn', 'compress-workflow-bar', 'compress-workflow-status',
            'compress-preview-stage', 'compress-preview-title', 'compress-preview-meta',
            'compress-preview-empty', 'compress-preview-body', 'compress-preview-pending',
            'compress-preview-original-only', 'compress-inline-compare',
            'compress-preview-base', 'compress-preview-overlay', 'compress-preview-handle',
            'compress-preview-top', 'compress-preview-stats', 'compress-preview-actions',
            'compress-preview-rerun', 'compress-preview-download',
            'compare-label-original', 'compare-label-compressed', 'compare-drag-hint',
        ].forEach((id) => {
            els[id] = document.getElementById(id);
        });
    }

    function initCompareModal() {
        els['compare-modal'] = document.getElementById('compare-modal');
        if (!els['compare-modal']) return;

        els['compare-modal-close'] = document.getElementById('compare-modal-close');
        els['compare-modal-title'] = document.getElementById('compare-modal-title');
        els['compare-modal-meta'] = document.getElementById('compare-modal-meta');
        els['compare-modal-slider'] = document.getElementById('compare-modal-slider');
        els['compare-modal-overlay'] = document.getElementById('compare-modal-overlay');
        els['compare-modal-handle'] = document.getElementById('compare-modal-handle');
        els['compare-modal-base'] = document.getElementById('compare-modal-base');
        els['compare-modal-top'] = document.getElementById('compare-modal-top');

        els['compare-modal-close']?.addEventListener('click', closeCompareModal);
        els['compare-modal']?.querySelector('[data-compare-close]')?.addEventListener('click', closeCompareModal);
    }

    function openCompareModal(taskId) {
        const task = state.tasks.get(taskId);
        if (!task?.compressedUrl || !task.originalUrl) {
            toast('Comparison is available after compression finishes.', 'warn');
            return;
        }
        if (!els['compare-modal']) return;

        if (compareModalCleanup) compareModalCleanup();

        els['compare-modal-title'].textContent = task.file.name;
        els['compare-modal-meta'].textContent = `${formatBytes(task.originalSize)} original → ${formatBytes(task.compressedSize)} compressed · ${task.savedRatio.toFixed(1)}% saved`;

        const baseImg = els['compare-modal-base'];
        const topImg = els['compare-modal-top'];
        baseImg.src = task.compressedUrl;
        topImg.src = task.originalUrl;

        compareModalCleanup = setupCompareSlider(
            els['compare-modal-slider'],
            els['compare-modal-overlay'],
            els['compare-modal-handle'],
            topImg
        );

        els['compare-modal'].classList.remove('is-hidden');
        els['compare-modal'].removeAttribute('hidden');
        document.body.classList.add('compare-modal-open');
        els['compare-modal-close']?.focus();

        compareModalEscapeHandler = (e) => {
            if (e.key === 'Escape') closeCompareModal();
        };
        document.addEventListener('keydown', compareModalEscapeHandler);
    }

    function closeCompareModal() {
        if (!els['compare-modal']) return;
        if (compareModalCleanup) {
            compareModalCleanup();
            compareModalCleanup = null;
        }
        if (compareModalEscapeHandler) {
            document.removeEventListener('keydown', compareModalEscapeHandler);
            compareModalEscapeHandler = null;
        }
        els['compare-modal'].classList.add('is-hidden');
        els['compare-modal'].setAttribute('hidden', '');
        document.body.classList.remove('compare-modal-open');
        els['compare-modal-base'].removeAttribute('src');
        els['compare-modal-top'].removeAttribute('src');
    }

    async function detectAvif() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const blob = await new Promise((r) => canvas.toBlob(r, 'image/avif', 0.5));
            state.avifSupported = blob && blob.type === 'image/avif';
        } catch {
            state.avifSupported = false;
        }
        const opt = document.getElementById('avif-option');
        if (opt && !state.avifSupported) {
            opt.disabled = true;
            opt.textContent = 'AVIF (not supported in this browser)';
        }
    }

    function getAppVersion() {
        return window.NexusTools?.appVersion?.() || '2.2.9';
    }

    function initWorkers() {
        const workerUrl = window.NexusTools?.assetUrl?.('js/compress-worker.mjs') || `js/compress-worker.mjs?v=${getAppVersion()}`;
        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            const w = new Worker(workerUrl, { type: 'module' });
            w.busy = false;
            w.onmessage = (e) => handleWorkerMessage(w, e);
            workers.push(w);
        }
    }


    let activePhotoUaePreset = '';

    function syncPresetButtons() {
        const uaeVal = els['uae-preset']?.value || '';
        const passportId = window.NexusPassportStudio?.getActivePresetId?.() || '';
        document.querySelectorAll('[data-uae-preset]').forEach((btn) => {
            const action = btn.dataset.uaeAction || 'document';
            if (action === 'photo') {
                btn.classList.toggle(
                    'is-active',
                    passportId === 'uae-emirates' && btn.dataset.uaePreset === activePhotoUaePreset
                );
            } else {
                btn.classList.toggle('is-active', btn.dataset.uaePreset === uaeVal);
            }
        });
        const presetVal = els.preset?.value || 'custom';
        document.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.classList.toggle('is-active', presetVal !== 'custom' && btn.dataset.preset === presetVal);
        });
    }

    function bindEvents() {
        els.quality.addEventListener('input', (e) => {
            els['quality-val'].textContent = `${e.target.value}%`;
            markCustomPreset();
            saveSettings();
        });

        [
            'format', 'max-width', 'max-height', 'scale-percent', 'aspect-ratio',
            'target-size-value', 'target-size-unit', 'rename-pattern', 'fix-orientation',
            'watermark-enabled', 'watermark-type', 'watermark-text', 'watermark-position',
        ].forEach((id) => {
            const el = els[id] || document.getElementById(id);
            if (el) el.addEventListener('change', () => { markCustomPreset(); syncTargetSizeKbField(); saveSettings(); });
            if (el && el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'file') {
                el.addEventListener('input', () => { markCustomPreset(); syncTargetSizeKbField(); saveSettings(); });
            }
        });

        els['watermark-enabled']?.addEventListener('change', () => {
            toggleWatermarkFields();
            markCustomPreset();
            saveSettings();
        });
        els['watermark-opacity']?.addEventListener('input', (e) => {
            if (els['watermark-opacity-val']) {
                els['watermark-opacity-val'].textContent = `${e.target.value}%`;
            }
            markCustomPreset();
            saveSettings();
        });
        els['watermark-type']?.addEventListener('change', toggleWatermarkFields);
        els['watermark-logo']?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            state.watermarkLogo = file || null;
            markCustomPreset();
            saveSettings();
            if (file) toast('Logo loaded for this batch.', 'info');
        });

        els.preset.addEventListener('change', () => {
            if (els['uae-preset']) els['uae-preset'].value = '';
            applyPreset();
            syncPresetButtons();
        });
        els['uae-preset'].addEventListener('change', () => {
            applyUaePreset();
            syncPresetButtons();
        });

        document.querySelectorAll('[data-uae-preset]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const val = btn.dataset.uaePreset;
                const action = btn.dataset.uaeAction || 'document';

                if (action === 'photo') {
                    const passportApi = window.NexusPassportStudio;
                    if (!passportApi?.selectPreset) return;
                    if (btn.classList.contains('is-active')) {
                        activePhotoUaePreset = '';
                        passportApi.clearPreset?.({ silent: true });
                        toast('Portal preset cleared.', 'info');
                    } else {
                        activePhotoUaePreset = val;
                        if (els['uae-preset']) els['uae-preset'].value = '';
                        if (passportApi.getActivePresetId?.() !== 'uae-emirates') {
                            passportApi.selectPreset('uae-emirates');
                        }
                    }
                    syncPresetButtons();
                    return;
                }

                if (els['uae-preset'].value === val) {
                    els['uae-preset'].value = '';
                    markCustomPreset();
                    toast('Portal preset cleared.', 'info');
                    syncPresetButtons();
                    return;
                }
                activePhotoUaePreset = '';
                await goToCompressorWithUaePreset(val);
            });
        });
        document.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.preset;
                if (els.preset.value === val) {
                    els.preset.value = 'custom';
                    if (els['uae-preset']) els['uae-preset'].value = '';
                    syncPresetButtons();
                    toast('Preset cleared.', 'info');
                    return;
                }
                els.preset.value = val;
                if (els['uae-preset']) els['uae-preset'].value = '';
                applyPreset();
                syncPresetButtons();
            });
        });

        els.format.addEventListener('change', () => updateFormatForTargetSize());
        els['target-size-value']?.addEventListener('change', () => updateFormatForTargetSize());
        els['target-size-unit']?.addEventListener('change', () => updateFormatForTargetSize());

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => {
            els['drop-zone'].addEventListener(ev, preventDefaults);
        });

        let compressDragDepth = 0;
        const setCompressDrag = (active) => {
            els['drop-zone'].classList.toggle('drag-active', active);
        };
        els['drop-zone'].addEventListener('dragenter', () => {
            compressDragDepth += 1;
            setCompressDrag(true);
        });
        els['drop-zone'].addEventListener('dragover', () => setCompressDrag(true));
        els['drop-zone'].addEventListener('dragleave', () => {
            compressDragDepth = Math.max(0, compressDragDepth - 1);
            if (compressDragDepth === 0) setCompressDrag(false);
        });

        els['drop-zone'].addEventListener('drop', (e) => {
            compressDragDepth = 0;
            setCompressDrag(false);
            handleFiles(e.dataTransfer.files);
        });
        els['drop-zone'].addEventListener('click', (e) => {
            if (e.target.closest('label, button, a, input')) return;
            els['file-input'].click();
        });
        els['drop-zone'].addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                els['file-input'].click();
            }
        });
        els['file-input'].addEventListener('change', (e) => handleFiles(e.target.files));
        els['folder-input'].addEventListener('change', (e) => handleFiles(e.target.files));

        els['download-all-btn'].addEventListener('click', downloadAllZip);
        els['zip-cancel']?.addEventListener('click', (e) => {
            e.preventDefault();
            cancelZipBuild();
        });
        els['memory-guard-dismiss']?.addEventListener('click', () => {
            els['memory-guard-notice']?.classList.add('is-hidden');
        });
        els['clear-all-btn'].addEventListener('click', clearAll);
        els['start-compress-btn']?.addEventListener('click', startCompression);
        els['compress-preview-rerun']?.addEventListener('click', () => {
            if (state.selectedTaskId) recompressTask(state.selectedTaskId);
        });
        els['compress-preview-download']?.addEventListener('click', () => {
            const dl = els['compress-preview-download'];
            if (dl?.download) window.NexusTools?.trackDownload?.(dl.download, 'compress');
        });
        els['view-cards'].addEventListener('click', () => setViewMode('cards'));
        els['view-table'].addEventListener('click', () => setViewMode('table'));
        els['theme-toggle'].addEventListener('click', toggleTheme);

        document.getElementById('results-container')?.addEventListener('click', (e) => {
            const link = e.target.closest('.download-btn, .download-row');
            if (link?.download) {
                window.NexusTools?.trackDownload?.(link.download, 'compress');
            }
        });

        syncTargetSizeKbField();
        toggleWatermarkFields();
    }

    function syncTargetSizeKbFieldOnly() {
        const val = parseFloat(els['target-size-value']?.value);
        const unit = els['target-size-unit']?.value || 'kb';
        const hidden = els['target-size-kb'];
        if (!hidden) return;
        if (!val || val <= 0) {
            hidden.value = '';
            return;
        }
        hidden.value = String(unit === 'mb' ? Math.round(val * 1024) : Math.round(val));
    }

    function readTargetSizeKb() {
        const kb = els['target-size-kb']?.value;
        return kb ? parseInt(kb, 10) : null;
    }

    function updateFormatForTargetSize(opts = {}) {
        syncTargetSizeKbFieldOnly();
        const hasTarget = Boolean(readTargetSizeKb());
        const pngOpt = els.format?.querySelector('option[value="image/png"]');
        if (pngOpt) pngOpt.disabled = hasTarget;

        const hint = document.getElementById('format-target-hint');
        hint?.classList.toggle('is-hidden', !hasTarget);

        if (hasTarget && els.format.value === 'image/png') {
            els.format.value = 'image/jpeg';
            if (!opts.silent) {
                toast('PNG cannot meet a file-size cap — switched format to JPEG.', 'info');
            }
            saveSettings();
        }
    }

    function syncTargetSizeKbField() {
        syncTargetSizeKbFieldOnly();
        updateFormatForTargetSize({ silent: true });
    }

    function parseTargetSizeKb() {
        syncTargetSizeKbFieldOnly();
        return readTargetSizeKb();
    }

    function toggleWatermarkFields() {
        const on = els['watermark-enabled']?.checked;
        els['watermark-fields']?.classList.toggle('is-hidden', !on);
        const isLogo = els['watermark-type']?.value === 'logo';
        document.getElementById('wm-text-group')?.classList.toggle('is-hidden', isLogo);
        document.getElementById('wm-logo-group')?.classList.toggle('is-hidden', !isLogo);
    }

    function getWatermarkConfig() {
        const enabled = Boolean(els['watermark-enabled']?.checked);
        const type = els['watermark-type']?.value || 'text';
        const text = (els['watermark-text']?.value || '').trim();
        const opacity = parseInt(els['watermark-opacity']?.value || '70', 10) / 100;
        const position = els['watermark-position']?.value || 'bottom-right';
        const hasLogo = Boolean(state.watermarkLogo);
        const active = enabled && (type === 'text' ? text.length > 0 : hasLogo);
        return { enabled: active, type, text, opacity, position, logoFile: state.watermarkLogo };
    }

    async function applyWatermarkToBlob(blob, width, height, wm) {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        try {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();

            const pad = Math.round(Math.min(width, height) * 0.03);
            const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.04));
            ctx.globalAlpha = wm.opacity;

            if (wm.type === 'text' && wm.text) {
                ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                ctx.lineWidth = Math.max(2, fontSize * 0.08);
                const metrics = ctx.measureText(wm.text);
                const tw = metrics.width;
                const th = fontSize;
                const pos = watermarkCoords(width, height, tw, th, pad, wm.position);
                ctx.strokeText(wm.text, pos.x, pos.y);
                ctx.fillText(wm.text, pos.x, pos.y);
            } else if (wm.type === 'logo' && wm.logoFile) {
                const logoBitmap = await createImageBitmap(wm.logoFile);
                const maxLogoW = width * 0.28;
                const scale = Math.min(1, maxLogoW / logoBitmap.width);
                const lw = Math.round(logoBitmap.width * scale);
                const lh = Math.round(logoBitmap.height * scale);
                const pos = watermarkCoords(width, height, lw, lh, pad, wm.position);
                ctx.drawImage(logoBitmap, pos.x, pos.y, lw, lh);
                logoBitmap.close();
            }

            ctx.globalAlpha = 1;
            const outType = blob.type || 'image/png';
            const quality = outType === 'image/jpeg' || outType === 'image/webp' ? 0.92 : undefined;
            return new Promise((resolve, reject) => {
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Watermark failed'))), outType, quality);
            });
        } finally {
            canvas.width = 0;
            canvas.height = 0;
        }
    }

    function watermarkCoords(cw, ch, tw, th, pad, position) {
        const positions = {
            'bottom-right': { x: cw - tw - pad, y: ch - pad },
            'bottom-left': { x: pad, y: ch - pad },
            'top-right': { x: cw - tw - pad, y: th + pad },
            'top-left': { x: pad, y: th + pad },
            center: { x: (cw - tw) / 2, y: (ch + th) / 2 },
        };
        return positions[position] || positions['bottom-right'];
    }

    function markCustomPreset() {
        els.preset.value = 'custom';
        if (els['uae-preset']) els['uae-preset'].value = '';
        syncPresetButtons();
    }

    function applyCompressionValues(p) {
        els.quality.value = p.quality;
        els['quality-val'].textContent = `${p.quality}%`;
        els.format.value = p.format;
        els['max-width'].value = p.maxWidth ?? '';
        els['max-height'].value = p.maxHeight ?? '';
        if (els['scale-percent']) els['scale-percent'].value = p.scalePercent ?? 100;
        if (els['aspect-ratio']) els['aspect-ratio'].value = p.aspectRatio ?? '';
        if (p.targetSizeKb) {
            els['target-size-value'].value = p.targetSizeKb;
            els['target-size-unit'].value = 'kb';
        } else {
            els['target-size-value'].value = '';
        }
        syncTargetSizeKbField();
    }

    function applyPreset(opts = {}) {
        const key = els.preset.value;
        if (key === 'custom' || !PRESETS[key]) return;
        applyCompressionValues(PRESETS[key]);
        saveSettings();
        syncPresetButtons();
        if (!opts.silent) {
            const labels = { web: 'Website', email: 'Email', social: 'Social post', max: 'Full quality' };
            toast(`${labels[key] || key} preset applied.`, 'info');
        }
    }

    async function goToCompressorWithUaePreset(key) {
        els['uae-preset'].value = key;
        applyUaePreset({ silent: true });
        syncPresetButtons();
        if (window.__NEXUS_NAVIGATE_TOOL) {
            await window.__NEXUS_NAVIGATE_TOOL('compress');
        }
        toast('Portal preset applied. Add your document scans when ready.', 'info');
    }

    function applyUaePreset(opts = {}) {
        const key = els['uae-preset'].value;
        if (!key || !UAE_PRESETS[key]) return;
        els.preset.value = 'custom';
        applyCompressionValues(UAE_PRESETS[key]);
        saveSettings();
        syncPresetButtons();
        if (!opts.silent) {
            toast('Portal preset applied. Add your images when ready.', 'info');
        }
    }

    function getSettings() {
        const scaleRaw = parseInt(els['scale-percent']?.value, 10);
        return {
            quality: parseInt(els.quality.value, 10) / 100,
            format: els.format.value,
            maxWidth: els['max-width'].value ? parseInt(els['max-width'].value, 10) : null,
            maxHeight: els['max-height'].value ? parseInt(els['max-height'].value, 10) : null,
            scalePercent: scaleRaw > 0 && scaleRaw <= 100 ? scaleRaw : 100,
            aspectRatio: els['aspect-ratio']?.value || null,
            targetSizeKb: parseTargetSizeKb(),
            fixOrientation: els['fix-orientation'].checked,
            renamePattern: els['rename-pattern'].value || '{name}-compressed.{ext}',
            preset: els.preset.value,
            qualityUi: els.quality.value,
            watermark: getWatermarkConfig(),
        };
    }

    function saveSettings() {
        const s = getSettings();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            preset: els.preset.value,
            uaePreset: els['uae-preset']?.value || '',
            qualityUi: els.quality.value,
            format: s.format,
            maxWidth: els['max-width'].value,
            maxHeight: els['max-height'].value,
            targetSizeValue: els['target-size-value'].value,
            targetSizeUnit: els['target-size-unit'].value,
            scalePercent: els['scale-percent']?.value,
            aspectRatio: els['aspect-ratio']?.value,
            renamePattern: s.renamePattern,
            fixOrientation: s.fixOrientation,
            watermarkEnabled: els['watermark-enabled']?.checked,
            watermarkType: els['watermark-type']?.value,
            watermarkText: els['watermark-text']?.value,
            watermarkPosition: els['watermark-position']?.value,
            watermarkOpacity: els['watermark-opacity']?.value,
            viewMode: state.viewMode,
        }));
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const s = JSON.parse(raw);
            if (s.qualityUi) {
                els.quality.value = s.qualityUi;
                els['quality-val'].textContent = `${s.qualityUi}%`;
            }
            if (s.format) els.format.value = s.format;
            if (s.maxWidth !== undefined) els['max-width'].value = s.maxWidth;
            if (s.maxHeight !== undefined) els['max-height'].value = s.maxHeight;
            if (s.targetSizeValue !== undefined) els['target-size-value'].value = s.targetSizeValue;
            else if (s.targetSizeKb !== undefined) {
                els['target-size-value'].value = s.targetSizeKb;
                els['target-size-unit'].value = 'kb';
            }
            if (s.targetSizeUnit) els['target-size-unit'].value = s.targetSizeUnit;
            syncTargetSizeKbField();
            if (s.scalePercent !== undefined && els['scale-percent']) els['scale-percent'].value = s.scalePercent;
            if (s.aspectRatio !== undefined && els['aspect-ratio']) els['aspect-ratio'].value = s.aspectRatio;
            if (s.renamePattern) els['rename-pattern'].value = s.renamePattern;
            if (s.watermarkEnabled !== undefined && els['watermark-enabled']) {
                els['watermark-enabled'].checked = s.watermarkEnabled;
            }
            if (s.watermarkType) els['watermark-type'].value = s.watermarkType;
            if (s.watermarkText) els['watermark-text'].value = s.watermarkText;
            if (s.watermarkPosition) els['watermark-position'].value = s.watermarkPosition;
            if (s.watermarkOpacity) {
                els['watermark-opacity'].value = s.watermarkOpacity;
                if (els['watermark-opacity-val']) {
                    els['watermark-opacity-val'].textContent = `${s.watermarkOpacity}%`;
                }
            }
            toggleWatermarkFields();
            if (s.fixOrientation !== undefined) els['fix-orientation'].checked = s.fixOrientation;
            if (s.uaePreset && els['uae-preset'] && UAE_PRESETS[s.uaePreset]) {
                els['uae-preset'].value = s.uaePreset;
                applyUaePreset({ silent: true });
            } else if (s.preset) {
                els.preset.value = s.preset;
                if (s.preset !== 'custom') applyPreset({ silent: true });
            }
            if (s.viewMode) setViewMode(s.viewMode);
            syncTargetSizeKbField();
            syncPresetButtons();
        } catch { /* ignore */ }
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function getConfig() {
        updateFormatForTargetSize({ silent: true });
        const s = getSettings();
        const targetSizeKb = s.targetSizeKb;
        let format = s.format;
        if (targetSizeKb && format === 'image/png') {
            format = 'image/jpeg';
        }
        return {
            ...s,
            format,
            avifSupported: state.avifSupported,
        };
    }

    function isAcceptedImage(file) {
        if (ACCEPTED_TYPES.test(file.type)) return true;
        if (!file.type && ACCEPTED_EXT.test(file.name || '')) return true;
        return false;
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        state.cancelled = false;
        updateFormatForTargetSize();

        const valid = [...files].filter(isAcceptedImage);
        const skipped = files.length - valid.length;

        if (valid.length === 0) {
            toast('No supported image files found. Use JPEG, PNG, WebP, or AVIF.', 'error');
            return;
        }

        if (skipped > 0) {
            toast(`Skipped ${skipped} unsupported file(s). Only JPEG, PNG, WebP, and AVIF are supported.`, 'warn');
        }

        const hasOversized = valid.some((f) => f.size > MAX_FILE_BYTES);
        const isLargeBatch = valid.length > MAX_BATCH_FILES;
        state.sequentialMode = hasOversized || isLargeBatch;
        updateMemoryGuardNotice(hasOversized, isLargeBatch);

        showResultsArea();
        valid.forEach((file) => enqueueFile(file));
        els['file-input'].value = '';
        els['folder-input'].value = '';
        syncWorkflowUI();
        if (!state.selectedTaskId && valid.length) {
            const lastTask = [...state.tasks.values()].filter((t) => t.status === 'pending').pop();
            if (lastTask) selectTask(lastTask.id);
        }
        toast(`${valid.length} file(s) added — configure settings, then start compression.`, 'info');
    }

    function startCompression() {
        updateFormatForTargetSize();
        const config = getConfig();
        const pending = [...state.tasks.values()].filter((t) => t.status === 'pending');
        if (!pending.length) return;

        pending.forEach((task) => {
            task.config = { ...config };
            task.status = 'queued';
            state.queue.push(task.id);
            updateTaskStatus(task.id, tf('statusQueuedBadge', null, 'Queued'), 'processing');
        });

        const btn = els['start-compress-btn'];
        if (btn) {
            btn.disabled = true;
            btn.textContent = tf('compressing', null, 'Compressing…');
        }
        syncWorkflowUI();
        drainQueue();
        toast(`Compressing ${pending.length} file(s) with your current settings…`, 'info');
    }

    function enqueueFile(file) {
        const id = `task-${crypto.randomUUID().slice(0, 9)}`;
        const originalUrl = URL.createObjectURL(file);
        trackUrl(id, originalUrl);

        const task = {
            id,
            file,
            config: null,
            originalUrl,
            originalSize: file.size,
            status: 'pending',
        };
        state.tasks.set(id, task);

        renderTaskUI(task);
        updateBatchUI();
    }

    function updateMemoryGuardNotice(hasOversized, isLargeBatch) {
        const notice = els['memory-guard-notice'];
        if (!notice) return;
        if (!hasOversized && !isLargeBatch) {
            notice.classList.add('is-hidden');
            return;
        }
        const textEl = notice.querySelector('.memory-guard-notice__text');
        if (textEl) {
            const parts = [];
            if (hasOversized) parts.push(tf('memoryGuardOversized', null, 'one or more files exceed 25&nbsp;MB'));
            if (isLargeBatch) parts.push(tf('memoryGuardLargeBatch', { n: MAX_BATCH_FILES }, `you added more than ${MAX_BATCH_FILES} images`));
            const reason = parts.join(window.__NEXUS_LOCALE === 'ar' ? ' و' : ' and ');
            const cap = window.__NEXUS_LOCALE === 'ar' ? reason : reason.charAt(0).toUpperCase() + reason.slice(1);
            textEl.innerHTML = tf('memoryGuardDynamic', { reason: cap }, `<strong>Large batch detected.</strong> ${cap} — processing will run <strong>one file at a time</strong> to keep your browser stable.`);
        }
        notice.classList.remove('is-hidden');
    }

    function drainQueue() {
        if (state.cancelled) return;
        if (state.sequentialMode && workers.some((w) => w.busy)) return;
        const idle = workers.find((w) => !w.busy);
        if (!idle || state.queue.length === 0) return;

        const id = state.queue.shift();
        const task = state.tasks.get(id);
        if (!task || task.status === 'removed') return;

        idle.busy = true;
        task.status = 'processing';
        updateTaskStatus(id, tf('statusProcessing', null, 'Processing…'), 'processing');

        idle.postMessage({ id, file: task.file, config: task.config });
    }

    function handleWorkerMessage(worker, e) {
        worker.busy = false;
        const data = e.data;
        const { id, success } = data;
        const task = state.tasks.get(id);

        if (!task || task.status === 'removed') {
            drainQueue();
            return;
        }

        if (success) {
            Promise.resolve(onTaskSuccess(task, data))
                .catch((err) => onTaskError(task, err?.message || String(err)))
                .finally(() => {
                    drainQueue();
                    updateBatchUI();
                    syncWorkflowUI();
                });
            return;
        }

        onTaskError(task, data.error);
        drainQueue();
        updateBatchUI();
        syncWorkflowUI();
    }

    async function onTaskSuccess(task, data) {
        let { blob, outputType, width, height, originalWidth, originalHeight, metTarget, targetSizeKb, usedQuality } = data;

        const wm = task.config?.watermark || getWatermarkConfig();
        if (wm?.enabled) {
            try {
                blob = await applyWatermarkToBlob(blob, width, height, wm);
                outputType = blob.type;
            } catch (err) {
                toast(`Watermark skipped for ${task.file.name}: ${err.message}`, 'warn');
            }
        }

        const compressedUrl = URL.createObjectURL(blob);
        trackUrl(task.id, compressedUrl);

        let savedRatio = ((task.originalSize - blob.size) / task.originalSize) * 100;

        const newName = buildFilename(task.file.name, outputType);
        task.status = 'done';
        task.blob = blob;
        task.compressedUrl = compressedUrl;
        task.compressedSize = blob.size;
        task.savedRatio = savedRatio;
        task.outputType = outputType;
        task.codecEngine = data.codecEngine || 'Canvas';
        task.codecLabel = data.codecLabel || data.codecEngine || 'Canvas';
        task.dimensions = `${originalWidth}×${originalHeight} → ${width}×${height}`;
        task.newName = newName;

        state.compressedFiles.set(task.id, { name: newName, blob });

        updateTaskUI(task);
        let statusLabel;
        let statusKind = 'success';
        if (savedRatio < 0) {
            statusLabel = `${Math.abs(savedRatio).toFixed(1)}% larger`;
            statusKind = 'warn';
            if (outputType === 'image/png' || task.file.type === 'image/png') {
                toast(
                    `${task.file.name}: PNG stays lossless — quality slider does not apply. Choose WebP or JPEG to shrink further.`,
                    'warn'
                );
            }
        } else {
            statusLabel = `Saved ${savedRatio.toFixed(1)}%`;
        }
        if (data.forcedLossy && els.format.value === 'image/png') {
            toast('PNG cannot hit a size cap — used JPEG for this file.', 'info');
        }

        if (targetSizeKb && metTarget === false) {
            const kb = (blob.size / 1024).toFixed(1);
            const pct = Math.round((usedQuality || 0) * 100);
            statusLabel = `Over target (${kb} KB)`;
            statusKind = 'error';
            toast(
                `${task.file.name}: could not reach ${targetSizeKb} KB (got ${kb} KB at ${pct}% quality). Try a smaller max width or lower the starting quality.`,
                'error'
            );
        } else if (targetSizeKb && metTarget) {
            statusLabel = `Under ${targetSizeKb} KB · saved ${savedRatio.toFixed(1)}%`;
            statusKind = 'success';
        }
        updateTaskStatus(task.id, statusLabel, statusKind);
        pushHistory(task);
        saveSettings();
    }

    function onTaskError(task, error) {
        task.status = 'error';
        task.error = error;
        window.NexusSentry?.captureException(error, {
            taskId: task.id,
            fileName: task.file?.name,
            tool: 'compress',
        });
        updateTaskStatus(task.id, tf('statusFailed', null, 'Failed'), 'error');
        const errEl = document.querySelector(`#${task.id} .error-msg`);
        if (errEl) {
            errEl.textContent = error || tf('compressionFailed', null, 'Compression failed');
            errEl.classList.remove('is-hidden');
        }
        toast(`${task.file.name}: ${error}`, 'error');
        syncWorkflowUI();
    }

    function buildFilename(originalName, mime) {
        const pattern = els['rename-pattern'].value || '{name}-compressed.{ext}';
        const base = originalName.replace(/\.[^.]+$/, '');
        const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        return pattern
            .replace(/\{name\}/g, base)
            .replace(/\{ext\}/g, ext)
            .replace(/\{suffix\}/g, 'compressed');
    }

    function renderTaskUI(task) {
        const card = document.createElement('article');
        card.id = task.id;
        card.className = 'result-card file-card result-card--processing';
        card.dataset.taskId = task.id;

        card.innerHTML = `
            <div class="file-thumb">
                <img class="file-thumb-img" alt="" decoding="async">
            </div>
            <div class="file-info">
                <div class="file-name result-name" title="${escapeHtml(task.file.name)}">${escapeHtml(task.file.name)}</div>
                <div class="file-meta">
                    <span class="status-badge status-ready">Ready</span>
                    <span class="codec-badge is-hidden" aria-hidden="true"></span>
                    <span class="file-meta-sizes is-hidden">${formatBytes(task.originalSize)} → <strong class="compressed-size">…</strong></span>
                </div>
                <div class="file-progress" aria-hidden="true"><div class="file-progress-fill file-progress-fill--active"></div></div>
                <p class="dim-line dim-text visually-hidden" aria-hidden="true">—</p>
                <p class="error-msg is-hidden" role="alert"></p>
            </div>
            <div class="file-actions result-actions">
                <button type="button" class="icon-btn exif-info-btn" aria-label="EXIF info for ${escapeHtml(task.file.name)}" title="View metadata">ℹ️</button>
                <button type="button" class="icon-btn compare-view-btn is-hidden" disabled aria-label="Compare ${escapeHtml(task.file.name)}">👁</button>
                <button type="button" class="icon-btn rerun-btn is-hidden" disabled aria-label="Re-run ${escapeHtml(task.file.name)}">↻</button>
                <a class="icon-btn download-btn is-hidden" download aria-label="Download ${escapeHtml(task.file.name)}">⬇</a>
                <button type="button" class="icon-btn remove-btn" aria-label="Remove ${escapeHtml(task.file.name)}">✕</button>
            </div>
        `;
        card._nexusFile = task.file;

        els['results-list'].prepend(card);
        const thumb = card.querySelector('.file-thumb-img');
        if (thumb && task.originalUrl) thumb.src = task.originalUrl;
        renderTableRow(task);

        card.querySelector('.exif-info-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await window.NexusTools?.ensureExifViewer?.();
                await window.NexusExif?.showExif?.(task.file);
            } catch (err) {
                toast('Could not load metadata viewer.', 'error');
            }
        });
        card.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeTask(task.id);
        });
        card.querySelector('.compare-view-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            card.querySelector('.compare-view-btn')?.classList.remove('compare-view-btn--pulse');
            openCompareModal(task.id);
        });
        card.querySelector('.rerun-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            recompressTask(task.id);
        });
        card.querySelector('.download-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const dl = e.currentTarget;
            if (dl?.download) window.NexusTools?.trackDownload?.(dl.download, 'compress');
        });
        card.addEventListener('click', () => selectTask(task.id));
    }

    function renderTableRow(task) {
        const tr = document.createElement('tr');
        tr.id = `row-${task.id}`;
        tr.innerHTML = `
            <td class="table-name-cell" title="${escapeHtml(task.file.name)}">${escapeHtml(task.file.name)}</td>
            <td class="dim-cell dim-text">—</td>
            <td>${formatBytes(task.originalSize)}</td>
            <td class="out-cell">…</td>
            <td class="saved-cell">—</td>
            <td><span class="status-badge status-ready">Ready</span></td>
            <td class="table-actions">
                <button type="button" class="btn-link compare-row is-hidden" disabled>👁 Compare</button>
                <button type="button" class="btn-link recompress-row">Again</button>
                <button type="button" class="btn-link remove-row">Remove</button>
                <a class="btn-link download-row is-hidden" download>Save</a>
            </td>
        `;
        els['results-table-body'].prepend(tr);
        tr.querySelector('.remove-row').addEventListener('click', () => removeTask(task.id));
        tr.querySelector('.compare-row')?.addEventListener('click', () => openCompareModal(task.id));
        tr.querySelector('.recompress-row').addEventListener('click', () => recompressTask(task.id));
    }

    function updateTaskUI(task) {
        const card = document.getElementById(task.id);
        const row = document.getElementById(`row-${task.id}`);
        if (!card) return;

        const thumb = card.querySelector('.file-thumb-img');
        if (thumb) thumb.src = task.compressedUrl;

        card.querySelector('.compressed-size').textContent = formatBytes(task.compressedSize);
        const dimLine = card.querySelector('.dim-line');
        if (dimLine) dimLine.textContent = task.dimensions;

        const statusBadge = card.querySelector('.status-badge');
        statusBadge?.classList.add('is-hidden');

        const meta = card.querySelector('.file-meta');
        let savingsBadge = card.querySelector('.savings-badge');
        if (!savingsBadge && meta) {
            savingsBadge = document.createElement('span');
            savingsBadge.className = 'savings-badge';
            meta.appendChild(savingsBadge);
        }
        if (savingsBadge) {
            savingsBadge.textContent = task.savedRatio < 0
                ? `+${Math.abs(task.savedRatio).toFixed(0)}% larger`
                : `${task.savedRatio.toFixed(0)}% saved`;
        }

        const codecBadge = card.querySelector('.codec-badge');
        if (codecBadge && task.codecLabel && task.codecLabel !== 'Canvas') {
            codecBadge.textContent = `⚡ ${task.codecLabel}`;
            codecBadge.classList.remove('is-hidden');
        } else if (codecBadge) {
            codecBadge.classList.add('is-hidden');
        }

        card.querySelector('.file-meta-sizes')?.classList.remove('is-hidden');

        const progressFill = card.querySelector('.file-progress-fill');
        if (progressFill) {
            progressFill.classList.remove('file-progress-fill--active');
            progressFill.style.width = '100%';
        }

        const dl = card.querySelector('.download-btn');
        dl.href = task.compressedUrl;
        dl.download = task.newName;
        card.querySelector('.file-actions')?.classList.remove('is-hidden');
        card.querySelector('.compare-view-btn')?.classList.remove('is-hidden');
        card.querySelector('.compare-view-btn') && (card.querySelector('.compare-view-btn').disabled = false);
        card.querySelector('.download-btn')?.classList.remove('is-hidden');
        card.querySelector('.rerun-btn')?.classList.remove('is-hidden');
        card.querySelector('.rerun-btn') && (card.querySelector('.rerun-btn').disabled = false);
        card.classList.remove('result-card--processing');
        card.classList.add('result-card--ready');
        selectTask(task.id);
        syncWorkflowUI();
        // Trigger PWA install prompt after first successful compression
        setTimeout(() => window.__nexusShowPwaPrompt?.(), 1500);
        const compareBtn = card.querySelector('.compare-view-btn');
        if (compareBtn) {
            compareBtn.disabled = false;
            compareBtn.classList.add('compare-view-btn--pulse');
        }

        if (row) {
            row.querySelector('.dim-cell').textContent = task.dimensions;
            row.querySelector('.out-cell').textContent = formatBytes(task.compressedSize);
            row.querySelector('.saved-cell').textContent =
                task.savedRatio < 0
                    ? `+${Math.abs(task.savedRatio).toFixed(1)}%`
                    : `${task.savedRatio.toFixed(1)}%`;
            const dlRow = row.querySelector('.download-row');
            dlRow.href = task.compressedUrl;
            dlRow.download = task.newName;
            dlRow.classList.remove('is-hidden');
            const compareRow = row.querySelector('.compare-row');
            if (compareRow) {
                compareRow.classList.remove('is-hidden');
                compareRow.disabled = false;
            }
        }

        updateBatchDownloadBtn();
    }

    function clearPreviewCompare() {
        if (previewCompareCleanup) {
            previewCompareCleanup();
            previewCompareCleanup = null;
        }
    }

    function selectTask(id) {
        const task = state.tasks.get(id);
        if (!task || task.status === 'removed') return;
        state.selectedTaskId = id;
        document.querySelectorAll('.result-card').forEach((card) => {
            card.classList.toggle('is-selected', card.id === id);
        });
        updatePreviewStage(task);
    }

    function updatePreviewStage(task) {
        if (!els['compress-preview-stage']) return;

        els['compress-preview-stage'].classList.remove('is-hidden');
        els['compress-preview-empty']?.classList.add('is-hidden');
        els['compress-preview-body']?.classList.remove('is-hidden');

        if (els['compress-preview-title']) {
            els['compress-preview-title'].textContent = task.file.name;
        }

        const statsEl = els['compress-preview-stats'];
        const pendingEl = els['compress-preview-pending'];
        const compareEl = els['compress-inline-compare'];
        const actionsEl = els['compress-preview-actions'];

        clearPreviewCompare();

        if (task.status === 'pending') {
            actionsEl?.classList.add('is-hidden');
            compareEl?.classList.add('is-hidden');
            pendingEl?.classList.remove('is-hidden');
            if (els['compress-preview-original-only']) {
                els['compress-preview-original-only'].src = task.originalUrl;
            }
            if (els['compress-preview-meta']) {
                els['compress-preview-meta'].textContent =
                    `${formatBytes(task.originalSize)} · not compressed yet — adjust settings, then click Start compression`;
            }
            if (statsEl) {
                statsEl.innerHTML = `
                    <div><dt>Status</dt><dd>Waiting</dd></div>
                    <div><dt>Original</dt><dd>${formatBytes(task.originalSize)}</dd></div>
                    <div><dt>Output</dt><dd>—</dd></div>
                    <div><dt>Saved</dt><dd>—</dd></div>`;
            }
            return;
        }

        pendingEl?.classList.add('is-hidden');

        if (task.status === 'processing' || task.status === 'queued') {
            actionsEl?.classList.add('is-hidden');
            compareEl?.classList.add('is-hidden');
            pendingEl?.classList.remove('is-hidden');
            if (els['compress-preview-original-only']) {
                els['compress-preview-original-only'].src = task.originalUrl;
            }
            if (els['compress-preview-meta']) {
                els['compress-preview-meta'].textContent = tf('previewCompressing', null, 'Compressing with your current settings…');
            }
            if (statsEl) {
                statsEl.innerHTML = `
                    <div><dt>Status</dt><dd>Processing</dd></div>
                    <div><dt>Original</dt><dd>${formatBytes(task.originalSize)}</dd></div>
                    <div><dt>Output</dt><dd>…</dd></div>
                    <div><dt>Saved</dt><dd>…</dd></div>`;
            }
            return;
        }

        if (task.status === 'done' && task.compressedUrl) {
            compareEl?.classList.remove('is-hidden');
            actionsEl?.classList.remove('is-hidden');

            const baseImg = els['compress-preview-base'];
            const topImg = els['compress-preview-top'];
            const overlay = els['compress-preview-overlay'];
            const handle = els['compress-preview-handle'];

            if (baseImg) baseImg.src = task.compressedUrl;
            if (topImg) topImg.src = task.originalUrl;

            previewCompareCleanup = setupCompareSlider(compareEl, overlay, handle, topImg);
            updateCompareLabels(task);

            const savedLabel = task.savedRatio < 0
                ? `${Math.abs(task.savedRatio).toFixed(1)}% larger`
                : `${task.savedRatio.toFixed(1)}% saved`;

            if (els['compress-preview-meta']) {
                els['compress-preview-meta'].textContent =
                    `${formatBytes(task.originalSize)} → ${formatBytes(task.compressedSize)} · ${savedLabel} · ${task.dimensions}`;
            }

            if (statsEl) statsEl.innerHTML = '';

            const dl = els['compress-preview-download'];
            if (dl) {
                dl.href = task.compressedUrl;
                dl.download = task.newName;
            }
            return;
        }

        if (task.status === 'error') {
            actionsEl?.classList.remove('is-hidden');
            compareEl?.classList.add('is-hidden');
            pendingEl?.classList.remove('is-hidden');
            if (els['compress-preview-original-only']) {
                els['compress-preview-original-only'].src = task.originalUrl;
            }
            if (els['compress-preview-meta']) {
                els['compress-preview-meta'].textContent = task.error || tf('compressionFailed', null, 'Compression failed');
            }
        }
    }

    function setWorkspaceActive(active) {
        const workspace = document.querySelector('.compress-workspace');
        workspace?.classList.toggle('compress-workspace--active', active);
        els['drop-zone']?.closest('.compress-main-col')?.classList.toggle('has-files', active);
        const dropTitle = els['drop-zone']?.querySelector('.drop-title');
        if (dropTitle) {
            dropTitle.textContent = active
                ? tf('dropTitleMore', null, 'Add more files')
                : window.__NEXUS_T?.('dropTitle') || 'Drop your images here';
        }
    }

    function syncWorkflowUI() {
        const all = [...state.tasks.values()].filter((t) => t.status !== 'removed');
        const pending = all.filter((t) => t.status === 'pending');
        const active = all.filter((t) => t.status === 'processing' || t.status === 'queued');
        const done = all.filter((t) => t.status === 'done');
        const bar = els['compress-workflow-bar'];
        const btn = els['start-compress-btn'];
        const statusEl = els['compress-workflow-status'];

        if (!all.length) {
            bar?.classList.add('is-hidden');
            els['compress-preview-stage']?.classList.add('is-hidden');
            state.selectedTaskId = null;
            clearPreviewCompare();
            updateWorkflowStep('upload');
            setWorkspaceActive(false);
            return;
        }

        setWorkspaceActive(true);
        bar?.classList.remove('is-hidden');
        els['compress-preview-stage']?.classList.remove('is-hidden');

        if (pending.length && !active.length) {
            updateWorkflowStep('settings');
            if (statusEl) {
                statusEl.textContent =
                    pending.length === 1
                        ? tf('statusQueuedOne', null, '1 file queued — adjust settings in the sidebar, then start')
                        : tf('statusQueued', { n: pending.length }, `${pending.length} files queued — adjust settings in the sidebar, then start`);
            }
            if (btn) {
                btn.classList.remove('is-hidden');
                btn.disabled = false;
                const startBase = window.__NEXUS_T?.('startCompression') || 'Start compression';
                btn.textContent = `${startBase} (${pending.length})`;
            }
        } else if (active.length) {
            updateWorkflowStep('settings');
            if (statusEl) {
                statusEl.textContent = tf(
                    'statusCompressing',
                    { done: done.length, total: all.length },
                    `Compressing… ${done.length} of ${all.length} complete`
                );
            }
            if (btn) {
                btn.classList.remove('is-hidden');
                btn.disabled = true;
                btn.textContent = tf('compressing', null, 'Compressing…');
            }
        } else if (done.length) {
            updateWorkflowStep('download');
            if (statusEl) {
                statusEl.textContent =
                    done.length === 1
                        ? tf('statusReadyOne', null, '1 file ready — compare with the slider, then download')
                        : tf('statusReady', { n: done.length }, `${done.length} files ready — compare with the slider, then download`);
            }
            if (btn) {
                btn.classList.add('is-hidden');
            }
        }

        if (state.selectedTaskId) {
            const selected = state.tasks.get(state.selectedTaskId);
            if (selected && selected.status !== 'removed') {
                updatePreviewStage(selected);
            }
        }
    }

    function updateTaskStatus(id, text, type) {
        document.querySelectorAll(`#${id} .status-badge, #row-${id} .status-badge`).forEach((badge) => {
            badge.textContent = text;
            badge.className = `status-badge status-${type}`;
            badge.classList.remove('is-hidden');
        });
        const card = document.getElementById(id);
        if (!card) return;
        const isProcessing = type === 'processing';
        card.classList.toggle('result-card--processing', isProcessing);
        const fill = card.querySelector('.file-progress-fill');
        fill?.classList.toggle('file-progress-fill--active', isProcessing);
        if (type === 'error') {
            card.classList.remove('result-card--processing', 'result-card--ready');
            fill?.classList.remove('file-progress-fill--active');
        }
    }

    function recompressTask(id) {
        const task = state.tasks.get(id);
        if (!task) return;
        revokeTaskUrls(id);
        task.originalUrl = URL.createObjectURL(task.file);
        trackUrl(id, task.originalUrl);
        task.compressedUrl = null;
        task.blob = null;
        state.compressedFiles.delete(id);
        updateFormatForTargetSize();
        task.config = getConfig();
        task.status = 'queued';
        state.queue.push(id);

        const card = document.getElementById(id);
        const row = document.getElementById(`row-${id}`);
        if (card) {
            card.classList.remove('result-card--ready');
            card.classList.add('result-card--processing');
            card.querySelector('.compare-view-btn')?.classList.remove('compare-view-btn--pulse');
            card.querySelector('.compressed-size').textContent = '…';
            card.querySelector('.file-actions')?.classList.add('is-hidden');
            card.querySelector('.savings-badge')?.remove();
            card.querySelector('.file-meta-sizes')?.classList.add('is-hidden');
            card.querySelector('.status-badge')?.classList.remove('is-hidden');
            const thumb = card.querySelector('.file-thumb-img');
            if (thumb && task.originalUrl) thumb.src = task.originalUrl;
            const progressFill = card.querySelector('.file-progress-fill');
            if (progressFill) {
                progressFill.style.width = '35%';
                progressFill.classList.add('file-progress-fill--active');
            }
            const compareBtn = card.querySelector('.compare-view-btn');
            if (compareBtn) compareBtn.disabled = true;
        }
        if (row) {
            row.querySelector('.out-cell').textContent = '…';
            row.querySelector('.saved-cell').textContent = '—';
            row.querySelector('.dim-cell').textContent = '…';
            const dlRow = row.querySelector('.download-row');
            if (dlRow) {
                dlRow.classList.add('is-hidden');
                dlRow.removeAttribute('href');
                dlRow.onclick = null;
            }
            const compareRow = row.querySelector('.compare-row');
            if (compareRow) compareRow.disabled = true;
        }
        updateTaskStatus(id, tf('statusProcessing', null, 'Processing…'), 'processing');
        if (state.selectedTaskId === id) updatePreviewStage(task);
        syncWorkflowUI();
        drainQueue();
        toast('Running compression again…', 'info');
    }

    async function copyImage(id) {
        const task = state.tasks.get(id);
        if (!task?.blob) return;
        try {
            await navigator.clipboard.write([new ClipboardItem({ [task.blob.type]: task.blob })]);
            toast('Copied to clipboard', 'success');
        } catch {
            toast('Clipboard not supported for this image', 'warn');
        }
    }

    function removeTask(id) {
        const task = state.tasks.get(id);
        if (!task) return;
        if (els['compare-modal'] && !els['compare-modal'].classList.contains('is-hidden')) {
            const title = els['compare-modal-title']?.textContent;
            if (title === task.file.name) closeCompareModal();
        }
        task.status = 'removed';
        state.queue = state.queue.filter((q) => q !== id);
        state.compressedFiles.delete(id);
        revokeTaskUrls(id);
        document.getElementById(id)?.remove();
        document.getElementById(`row-${id}`)?.remove();
        state.tasks.delete(id);
        if (state.selectedTaskId === id) {
            state.selectedTaskId = null;
            const next = [...state.tasks.values()].find((t) => t.status !== 'removed');
            if (next) selectTask(next.id);
        }
        updateBatchUI();
        updateBatchDownloadBtn();
        if (state.tasks.size === 0) hideResultsIfEmpty();
        syncWorkflowUI();
    }

    function clearAll() {
        state.cancelled = true;
        state.queue = [];
        [...state.tasks.keys()].forEach((id) => {
            revokeTaskUrls(id);
            document.getElementById(id)?.remove();
            document.getElementById(`row-${id}`)?.remove();
        });
        state.tasks.clear();
        state.compressedFiles.clear();
        state.selectedTaskId = null;
        state.cancelled = false;
        clearPreviewCompare();
        updateBatchUI();
        updateBatchDownloadBtn();
        hideResultsIfEmpty();
        syncWorkflowUI();
        toast('Cleared the list', 'info');
    }

    function revokeTaskUrls(id) {
        const urls = state.objectUrls.get(id) || [];
        urls.forEach((u) => URL.revokeObjectURL(u));
        state.objectUrls.delete(id);
    }

    function trackUrl(id, url) {
        if (!state.objectUrls.has(id)) state.objectUrls.set(id, []);
        state.objectUrls.get(id).push(url);
    }

    function updateWorkflowStep(step) {
        const order = ['upload', 'settings', 'download'];
        const idx = order.indexOf(step);
        document.querySelectorAll('.workflow-steps__item').forEach((el) => {
            const s = el.dataset.step;
            const si = order.indexOf(s);
            el.classList.toggle('is-active', s === step);
            el.classList.toggle('is-complete', si >= 0 && si < idx);
        });
    }

    function showResultsArea() {
        els['results-container'].classList.remove('is-hidden');
        els['batch-summary'].classList.remove('is-hidden');
        els['clear-all-btn'].classList.remove('is-hidden');
        els['view-toggle-wrap']?.classList.remove('is-hidden');
    }

    function hideResultsIfEmpty() {
        els['results-container'].classList.add('is-hidden');
        els['batch-summary'].classList.add('is-hidden');
        els['clear-all-btn'].classList.add('is-hidden');
        els['download-all-btn'].classList.add('is-hidden');
        els['view-toggle-wrap']?.classList.add('is-hidden');
        updateWorkflowStep('upload');
    }

    function updateBatchUI() {
        const all = [...state.tasks.values()].filter((t) => t.status !== 'removed');
        const done = all.filter((t) => t.status === 'done');
        const processing = all.filter((t) => t.status === 'processing' || t.status === 'queued').length;
        const total = all.length;

        let savedBytes = 0;
        let ratioSum = 0;
        done.forEach((t) => {
            savedBytes += Math.max(0, t.originalSize - t.compressedSize);
            ratioSum += t.savedRatio || 0;
        });

        els['batch-count'].textContent = `${total} file${total !== 1 ? 's' : ''}`;
        els['batch-saved'].textContent = `${formatBytes(savedBytes)} saved`;
        els['batch-avg'].textContent = done.length ? `${(ratioSum / done.length).toFixed(1)}% avg` : '—';
        els['batch-summary']?.classList.toggle('batch-summary--single', total <= 1);
        const pct = total ? ((total - processing) / total) * 100 : 0;
        els['batch-progress-bar'].style.width = `${pct}%`;
        const progressEl = els['batch-progress'];
        if (progressEl) progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    function updateBatchDownloadBtn() {
        const n = state.compressedFiles.size;
        els['download-all-btn'].classList.toggle('is-hidden', n < 2);
    }

    function resetZipUi() {
        const btn = els['download-all-btn'];
        const zipWrap = els['zip-progress-wrap'];
        const zipBar = els['zip-progress-bar'];
        const zipLabel = els['zip-progress-label'];
        const zipPct = els['zip-progress-pct'];
        if (btn) {
            btn.disabled = false;
            btn.textContent = tf('downloadZip', null, 'Download ZIP');
        }
        els['zip-cancel']?.classList.add('is-hidden');
        zipWrap?.classList.add('is-hidden');
        if (zipBar) zipBar.style.width = '0%';
        if (zipPct) zipPct.textContent = '0%';
        if (zipLabel) zipLabel.textContent = tf('buildingZip', null, 'Building ZIP…');
    }

    function cancelZipBuild() {
        state.zipAbort = true;
        state.zipGeneration += 1;
        resetZipUi();
        toast('ZIP build cancelled', 'warn');
    }

    function isZipRunStale(gen) {
        return state.zipAbort || gen !== state.zipGeneration;
    }

    async function downloadAllZip() {
        try {
            await window.NexusTools?.loadJsZip?.();
        } catch {
            toast('JSZip failed to load', 'error');
            return;
        }
        const btn = els['download-all-btn'];
        const zipWrap = els['zip-progress-wrap'];
        const zipBar = els['zip-progress-bar'];
        const zipLabel = els['zip-progress-label'];
        const zipPct = els['zip-progress-pct'];
        const zipCancel = els['zip-cancel'];
        const gen = ++state.zipGeneration;
        state.zipAbort = false;

        btn.disabled = true;
        btn.textContent = tf('buildingZip', null, 'Building ZIP…');
        zipWrap?.classList.remove('is-hidden');
        zipCancel?.classList.remove('is-hidden');
        if (zipBar) zipBar.style.width = '0%';
        if (zipPct) zipPct.textContent = '0%';
        if (zipLabel) zipLabel.textContent = tf('addingToZip', null, 'Adding files to ZIP…');

        try {
            const zip = new JSZip();
            const entries = [...state.compressedFiles.entries()];
            for (let i = 0; i < entries.length; i++) {
                if (isZipRunStale(gen)) return;
                const [, f] = entries[i];
                zip.file(f.name, f.blob);
                const pct = Math.round(((i + 1) / entries.length) * 40);
                if (zipBar) zipBar.style.width = `${pct}%`;
                if (zipPct) zipPct.textContent = `${pct}%`;
            }

            if (isZipRunStale(gen)) return;
            if (zipLabel) zipLabel.textContent = tf('compressingArchive', null, 'Compressing archive…');
            const content = await zip.generateAsync(
                { type: 'blob', streamFiles: true },
                (metadata) => {
                    if (isZipRunStale(gen)) return;
                    const pct = Math.round(40 + metadata.percent * 0.6);
                    if (zipBar) zipBar.style.width = `${pct}%`;
                    if (zipPct) zipPct.textContent = `${pct}%`;
                }
            );

            if (isZipRunStale(gen)) return;

            if (zipBar) zipBar.style.width = '100%';
            if (zipPct) zipPct.textContent = '100%';
            if (zipLabel) zipLabel.textContent = tf('zipDone', null, 'Done — starting download');

            const url = URL.createObjectURL(content);
            triggerDownload(url, 'funadventure-batch.zip', 'compress');
            URL.revokeObjectURL(url);
            toast('ZIP downloaded', 'success');
        } catch (err) {
            if (!isZipRunStale(gen)) toast(`ZIP failed: ${err.message}`, 'error');
        } finally {
            if (isZipRunStale(gen)) {
                resetZipUi();
            } else {
                btn.disabled = false;
                btn.textContent = tf('downloadZip', null, 'Download ZIP');
                zipCancel?.classList.add('is-hidden');
                window.setTimeout(() => zipWrap?.classList.add('is-hidden'), 1200);
            }
        }
    }

    function triggerDownload(url, name, toolName = 'compress') {
        window.NexusTools?.trackDownload?.(name, toolName);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function setViewMode(mode) {
        state.viewMode = mode;
        const cards = mode === 'cards';
        els['view-cards'].classList.toggle('active', cards);
        els['view-table'].classList.toggle('active', !cards);
        els['view-cards'].setAttribute('aria-pressed', String(cards));
        els['view-table'].setAttribute('aria-pressed', String(!cards));
        els['results-list'].classList.toggle('is-hidden', !cards);
        els['results-table-wrap'].classList.toggle('is-hidden', cards);
        saveSettings();
    }

    function toggleTheme() {
        const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(next);
    }

    function applyTheme(theme) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('nexus-theme', theme);
        const btn = els['theme-toggle'];
        if (!btn) return;
        const sun = btn.querySelector('.theme-icon-sun');
        const moon = btn.querySelector('.theme-icon-moon');
        const toLight = theme === 'dark';
        sun?.classList.toggle('is-hidden', !toLight);
        moon?.classList.toggle('is-hidden', toLight);
        const label = toLight
            ? tf('themeToggleLight', null, 'Switch to light theme')
            : tf('themeToggleDark', null, 'Switch to dark theme');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.setAttribute('aria-pressed', String(theme === 'light'));
    }

    function mimeFormatLabel(mime) {
        const map = {
            'image/jpeg': 'JPEG',
            'image/png': 'PNG',
            'image/webp': 'WebP',
            'image/avif': 'AVIF',
        };
        return map[mime] || (mime && mime.split('/')[1] ? mime.split('/')[1].toUpperCase() : 'IMG');
    }

    function updateCompareLabels(task) {
        const origEl = els['compare-label-original'];
        const compEl = els['compare-label-compressed'];
        const hint = els['compare-drag-hint'];
        if (!origEl || !compEl) return;

        const origFmt = mimeFormatLabel(task.file.type);
        const outFmt = mimeFormatLabel(task.outputType || task.blob?.type);
        const savedPct = task.savedRatio < 0
            ? `+${Math.abs(task.savedRatio).toFixed(0)}%`
            : `−${task.savedRatio.toFixed(0)}%`;

        origEl.innerHTML = `<span class="compare-label__title">${tf('compareOriginal', null, 'Original')}</span><span class="compare-label__meta">${formatBytes(task.originalSize)} · ${origFmt}</span>`;
        compEl.innerHTML = `<span class="compare-label__title">${tf('compareCompressed', null, 'Compressed')}</span><span class="compare-label__meta">${formatBytes(task.compressedSize)} (${savedPct}) · ${outFmt}</span>`;

        if (hint) {
            const mobile = window.matchMedia('(max-width: 780px)').matches;
            hint.classList.toggle('is-hidden', !mobile);
            hint.textContent = tf('compareDragHint', null, '← drag →');
        }
    }

    const setupCompareSlider =
        window.NexusCompareSlider?.setup ||
        function () {
            return () => {};
        };

    function pushHistory(task) {
        try {
            const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            hist.unshift({
                name: task.file.name,
                saved: task.savedRatio,
                at: Date.now(),
            });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 50)));
        } catch { /* ignore */ }
    }

    function toast(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.setAttribute('role', 'alert');
        el.textContent = message;
        els['toast-root'].appendChild(el);
        setTimeout(() => el.classList.add('toast-out'), 3200);
        setTimeout(() => el.remove(), 3800);
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }
})();
