(function () {
    const STORAGE_KEY = 'nexuscompress-settings';
    const HISTORY_KEY = 'nexuscompress-history';
    const WORKER_POOL_SIZE = 3;
    const ACCEPTED_TYPES = /^image\/(jpeg|png|webp|avif)$/i;

    const PRESETS = {
        web: { quality: 85, format: 'image/webp', maxWidth: 1920, maxHeight: null, targetSizeKb: null },
        email: { quality: 70, format: 'image/jpeg', maxWidth: 1200, maxHeight: null, targetSizeKb: null },
        social: { quality: 80, format: 'image/jpeg', maxWidth: 1080, maxHeight: null, targetSizeKb: null },
        max: { quality: 95, format: 'image/png', maxWidth: null, maxHeight: null, targetSizeKb: null },
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
    };

    const workers = [];
    const els = {};

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        cacheElements();
        detectAvif();
        initWorkers();
        loadSettings();
        bindEvents();
        applyTheme(localStorage.getItem('nexus-theme') || 'dark');
        registerServiceWorker();
        loadVersion();
        const yearEl = document.getElementById('footer-year');
        if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (local) return;
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    async function loadVersion() {
        const el = document.getElementById('app-version');
        if (!el) return;
        try {
            const res = await fetch('version.json');
            if (res.ok) {
                const { version } = await res.json();
                el.textContent = `v${version}`;
            }
        } catch {
            el.textContent = 'v2';
        }
    }

    function cacheElements() {
        [
            'drop-zone', 'file-input', 'folder-input', 'quality', 'quality-val', 'format',
            'max-width', 'max-height', 'preset', 'target-size-kb', 'rename-pattern',
            'fix-orientation', 'results-container', 'results-list', 'results-table-wrap',
            'results-table-body', 'download-all-btn', 'clear-all-btn', 'batch-summary',
            'batch-count', 'batch-saved', 'batch-avg', 'batch-progress-bar', 'batch-progress', 'empty-results',
            'view-cards', 'view-table', 'theme-toggle', 'toast-root',
        ].forEach((id) => {
            els[id] = document.getElementById(id);
        });
        els.navTabs = document.querySelectorAll('.nav-tab');
        els.panels = { compress: document.getElementById('panel-compress'), about: document.getElementById('panel-about') };
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

    function initWorkers() {
        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            const w = new Worker('js/worker.js');
            w.busy = false;
            w.onmessage = (e) => handleWorkerMessage(w, e);
            workers.push(w);
        }
    }

    function bindEvents() {
        els.quality.addEventListener('input', (e) => {
            els['quality-val'].textContent = `${e.target.value}%`;
            els.preset.value = 'custom';
            saveSettings();
        });

        ['format', 'max-width', 'max-height', 'target-size-kb', 'rename-pattern', 'fix-orientation'].forEach((id) => {
            const el = els[id] || document.getElementById(id);
            if (el) el.addEventListener('change', () => { els.preset.value = 'custom'; saveSettings(); });
            if (el && el.tagName === 'INPUT') el.addEventListener('input', () => { els.preset.value = 'custom'; saveSettings(); });
        });

        els.preset.addEventListener('change', applyPreset);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => {
            els['drop-zone'].addEventListener(ev, preventDefaults);
        });
        ['dragenter', 'dragover'].forEach((ev) => {
            els['drop-zone'].addEventListener(ev, () => els['drop-zone'].classList.add('drag-active'));
        });
        ['dragleave', 'drop'].forEach((ev) => {
            els['drop-zone'].addEventListener(ev, () => els['drop-zone'].classList.remove('drag-active'));
        });

        els['drop-zone'].addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
        els['drop-zone'].addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') els['file-input'].click();
        });
        els['file-input'].addEventListener('change', (e) => handleFiles(e.target.files));
        els['folder-input'].addEventListener('change', (e) => handleFiles(e.target.files));

        els['download-all-btn'].addEventListener('click', downloadAllZip);
        els['clear-all-btn'].addEventListener('click', clearAll);
        els['view-cards'].addEventListener('click', () => setViewMode('cards'));
        els['view-table'].addEventListener('click', () => setViewMode('table'));
        els['theme-toggle'].addEventListener('click', toggleTheme);

        els.navTabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                els.navTabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                const panel = tab.dataset.panel;
                Object.entries(els.panels).forEach(([key, el]) => {
                    el.classList.toggle('is-hidden', key !== panel);
                });
            });
        });
    }

    function applyPreset() {
        const key = els.preset.value;
        if (key === 'custom' || !PRESETS[key]) return;
        const p = PRESETS[key];
        els.quality.value = p.quality;
        els['quality-val'].textContent = `${p.quality}%`;
        els.format.value = p.format;
        els['max-width'].value = p.maxWidth || '';
        els['max-height'].value = p.maxHeight || '';
        els['target-size-kb'].value = p.targetSizeKb || '';
        saveSettings();
    }

    function getSettings() {
        return {
            quality: parseInt(els.quality.value, 10) / 100,
            format: els.format.value,
            maxWidth: els['max-width'].value ? parseInt(els['max-width'].value, 10) : null,
            maxHeight: els['max-height'].value ? parseInt(els['max-height'].value, 10) : null,
            targetSizeKb: els['target-size-kb'].value ? parseInt(els['target-size-kb'].value, 10) : null,
            fixOrientation: els['fix-orientation'].checked,
            renamePattern: els['rename-pattern'].value || '{name}-compressed.{ext}',
            preset: els.preset.value,
            qualityUi: els.quality.value,
        };
    }

    function saveSettings() {
        const s = getSettings();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            preset: els.preset.value,
            qualityUi: els.quality.value,
            format: s.format,
            maxWidth: els['max-width'].value,
            maxHeight: els['max-height'].value,
            targetSizeKb: els['target-size-kb'].value,
            renamePattern: s.renamePattern,
            fixOrientation: s.fixOrientation,
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
            if (s.targetSizeKb !== undefined) els['target-size-kb'].value = s.targetSizeKb;
            if (s.renamePattern) els['rename-pattern'].value = s.renamePattern;
            if (s.fixOrientation !== undefined) els['fix-orientation'].checked = s.fixOrientation;
            if (s.preset) {
                els.preset.value = s.preset;
                if (s.preset !== 'custom') applyPreset();
            }
            if (s.viewMode) setViewMode(s.viewMode);
        } catch { /* ignore */ }
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function getConfig() {
        const s = getSettings();
        return {
            ...s,
            avifSupported: state.avifSupported,
        };
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        state.cancelled = false;
        const config = getConfig();
        const valid = [...files].filter((f) => ACCEPTED_TYPES.test(f.type) || f.type.startsWith('image/'));

        if (valid.length === 0) {
            toast('No supported image files found.', 'error');
            return;
        }

        if (valid.length < files.length) {
            toast(`Skipped ${files.length - valid.length} unsupported file(s).`, 'warn');
        }

        showResultsArea();
        valid.forEach((file) => enqueueFile(file, config));
        els['file-input'].value = '';
        els['folder-input'].value = '';
        drainQueue();
    }

    function enqueueFile(file, config) {
        const id = `task-${crypto.randomUUID().slice(0, 9)}`;
        const originalUrl = URL.createObjectURL(file);
        trackUrl(id, originalUrl);

        const task = {
            id,
            file,
            config: { ...config },
            originalUrl,
            originalSize: file.size,
            status: 'queued',
        };
        state.tasks.set(id, task);
        state.queue.push(id);

        renderTaskUI(task);
        updateBatchUI();
    }

    function drainQueue() {
        if (state.cancelled) return;
        const idle = workers.find((w) => !w.busy);
        if (!idle || state.queue.length === 0) return;

        const id = state.queue.shift();
        const task = state.tasks.get(id);
        if (!task || task.status === 'removed') return;

        idle.busy = true;
        task.status = 'processing';
        updateTaskStatus(id, 'Processing…', 'processing');

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
            onTaskSuccess(task, data);
        } else {
            onTaskError(task, data.error);
        }

        drainQueue();
        updateBatchUI();
    }

    function onTaskSuccess(task, data) {
        const { blob, outputType, width, height, originalWidth, originalHeight } = data;
        const compressedUrl = URL.createObjectURL(blob);
        trackUrl(task.id, compressedUrl);

        let savedRatio = ((task.originalSize - blob.size) / task.originalSize) * 100;
        if (savedRatio < 0) savedRatio = 0;

        const newName = buildFilename(task.file.name, outputType);
        task.status = 'done';
        task.blob = blob;
        task.compressedUrl = compressedUrl;
        task.compressedSize = blob.size;
        task.savedRatio = savedRatio;
        task.outputType = outputType;
        task.dimensions = `${originalWidth}×${originalHeight} → ${width}×${height}`;
        task.newName = newName;

        state.compressedFiles.set(task.id, { name: newName, blob });

        updateTaskUI(task);
        updateTaskStatus(task.id, `Saved ${savedRatio.toFixed(1)}%`, 'success');
        pushHistory(task);
        saveSettings();
    }

    function onTaskError(task, error) {
        task.status = 'error';
        task.error = error;
        updateTaskStatus(task.id, 'Failed', 'error');
        const errEl = document.querySelector(`#${task.id} .error-msg`);
        if (errEl) {
            errEl.textContent = error || 'Compression failed';
            errEl.classList.remove('is-hidden');
        }
        toast(`${task.file.name}: ${error}`, 'error');
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
        card.className = 'result-card';
        card.dataset.taskId = task.id;

        card.innerHTML = `
            <div class="result-card-header">
                <h3 class="result-name" title="${escapeHtml(task.file.name)}">${escapeHtml(task.file.name)}</h3>
                <div class="result-badges">
                    <span class="status-badge status-processing">Queued</span>
                    <button type="button" class="btn-icon remove-btn" aria-label="Remove ${escapeHtml(task.file.name)}">×</button>
                </div>
            </div>
            <p class="result-meta">
                <span>Original: <strong>${formatBytes(task.originalSize)}</strong></span>
                <span class="dim-text">—</span>
                <span>Output: <strong class="compressed-size">…</strong></span>
            </p>
            <p class="dim-line dim-text">—</p>
            <p class="error-msg is-hidden" role="alert"></p>
            <div class="compare-container bg-checker" role="slider" aria-label="Compare original and compressed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0">
                <img src="${task.originalUrl}" class="compare-img original-img is-dimmed" alt="Original">
                <div class="loading-overlay"><div class="spinner"></div></div>
                <div class="compare-overlay is-hidden"><img class="compare-img compressed-img" alt="Compressed"></div>
                <div class="compare-handle is-hidden" aria-hidden="true"></div>
            </div>
            <div class="result-actions is-hidden">
                <button type="button" class="btn-secondary recompress-btn">Recompress</button>
                <button type="button" class="btn-secondary copy-btn">Copy image</button>
                <a class="btn-primary download-btn" download>Download</a>
            </div>
        `;

        els['results-list'].prepend(card);
        renderTableRow(task);

        card.querySelector('.remove-btn').addEventListener('click', () => removeTask(task.id));
        card.querySelector('.recompress-btn')?.addEventListener('click', () => recompressTask(task.id));
        card.querySelector('.copy-btn')?.addEventListener('click', () => copyImage(task.id));
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
            <td><span class="status-badge status-processing">Queued</span></td>
            <td class="table-actions">
                <button type="button" class="btn-link recompress-row">Redo</button>
                <button type="button" class="btn-link remove-row">Remove</button>
                <a class="btn-link download-row is-hidden" download>Save</a>
            </td>
        `;
        els['results-table-body'].prepend(tr);
        tr.querySelector('.remove-row').addEventListener('click', () => removeTask(task.id));
        tr.querySelector('.recompress-row').addEventListener('click', () => recompressTask(task.id));
    }

    function updateTaskUI(task) {
        const card = document.getElementById(task.id);
        const row = document.getElementById(`row-${task.id}`);
        if (!card) return;

        card.querySelector('.loading-overlay')?.remove();
        card.querySelector('.original-img')?.classList.remove('is-dimmed');
        card.querySelector('.compressed-size').textContent = formatBytes(task.compressedSize);
        card.querySelector('.dim-line').textContent = task.dimensions;
        card.querySelector('.dim-text')?.classList.remove('dim-text');

        const compImg = card.querySelector('.compressed-img');
        const overlay = card.querySelector('.compare-overlay');
        const handle = card.querySelector('.compare-handle');
        compImg.src = task.compressedUrl;
        overlay.classList.remove('is-hidden');
        handle.classList.remove('is-hidden');
        setupSlider(card.querySelector('.compare-container'), overlay, handle, compImg);

        const dl = card.querySelector('.download-btn');
        dl.href = task.compressedUrl;
        dl.download = task.newName;
        card.querySelector('.result-actions').classList.remove('is-hidden');

        if (row) {
            row.querySelector('.dim-cell').textContent = task.dimensions;
            row.querySelector('.out-cell').textContent = formatBytes(task.compressedSize);
            row.querySelector('.saved-cell').textContent = `${task.savedRatio.toFixed(1)}%`;
            const dlRow = row.querySelector('.download-row');
            dlRow.href = task.compressedUrl;
            dlRow.download = task.newName;
            dlRow.classList.remove('is-hidden');
        }

        updateBatchDownloadBtn();
    }

    function updateTaskStatus(id, text, type) {
        document.querySelectorAll(`#${id} .status-badge, #row-${id} .status-badge`).forEach((badge) => {
            badge.textContent = text;
            badge.className = `status-badge status-${type}`;
        });
    }

    function recompressTask(id) {
        const task = state.tasks.get(id);
        if (!task) return;
        revokeTaskUrls(id);
        state.compressedFiles.delete(id);
        task.config = getConfig();
        task.status = 'queued';
        state.queue.push(id);

        const card = document.getElementById(id);
        if (card) {
            card.querySelector('.compressed-size').textContent = '…';
            card.querySelector('.result-actions').classList.add('is-hidden');
            const overlay = card.querySelector('.loading-overlay');
            if (!overlay) {
                const container = card.querySelector('.compare-container');
                const div = document.createElement('div');
                div.className = 'loading-overlay';
                div.innerHTML = '<div class="spinner"></div>';
                container.appendChild(div);
            }
            card.querySelector('.compare-overlay')?.classList.add('is-hidden');
            card.querySelector('.compare-handle')?.classList.add('is-hidden');
        }
        updateTaskStatus(id, 'Processing…', 'processing');
        drainQueue();
        toast('Recompressing…', 'info');
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
        task.status = 'removed';
        state.queue = state.queue.filter((q) => q !== id);
        state.compressedFiles.delete(id);
        revokeTaskUrls(id);
        document.getElementById(id)?.remove();
        document.getElementById(`row-${id}`)?.remove();
        state.tasks.delete(id);
        updateBatchUI();
        updateBatchDownloadBtn();
        if (state.tasks.size === 0) hideResultsIfEmpty();
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
        state.cancelled = false;
        updateBatchUI();
        updateBatchDownloadBtn();
        hideResultsIfEmpty();
        toast('Cleared all results', 'info');
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

    function showResultsArea() {
        els['results-container'].classList.remove('is-hidden');
        els['empty-results'].classList.add('is-hidden');
        els['batch-summary'].classList.remove('is-hidden');
        els['clear-all-btn'].classList.remove('is-hidden');
    }

    function hideResultsIfEmpty() {
        els['results-container'].classList.add('is-hidden');
        els['empty-results'].classList.remove('is-hidden');
        els['batch-summary'].classList.add('is-hidden');
        els['clear-all-btn'].classList.add('is-hidden');
        els['download-all-btn'].classList.add('is-hidden');
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
        const pct = total ? ((total - processing) / total) * 100 : 0;
        els['batch-progress-bar'].style.width = `${pct}%`;
        const progressEl = els['batch-progress'];
        if (progressEl) progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    function updateBatchDownloadBtn() {
        const n = state.compressedFiles.size;
        els['download-all-btn'].classList.toggle('is-hidden', n < 2);
    }

    async function downloadAllZip() {
        if (typeof JSZip === 'undefined') {
            toast('JSZip failed to load', 'error');
            return;
        }
        const btn = els['download-all-btn'];
        btn.disabled = true;
        btn.textContent = 'Building ZIP…';
        try {
            const zip = new JSZip();
            state.compressedFiles.forEach((f) => zip.file(f.name, f.blob));
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            triggerDownload(url, 'nexuscompress-batch.zip');
            URL.revokeObjectURL(url);
            toast('ZIP downloaded', 'success');
        } catch (err) {
            toast(`ZIP failed: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Download ZIP';
        }
    }

    function triggerDownload(url, name) {
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
        const label = els['theme-toggle'].querySelector('.theme-toggle-label');
        const text = theme === 'dark' ? 'Light theme' : 'Dark theme';
        if (label) label.textContent = text;
        else els['theme-toggle'].textContent = text;
        els['theme-toggle'].setAttribute('aria-pressed', String(theme === 'light'));
    }

    function setupSlider(container, overlay, handle, innerImg) {
        let pct = 50;
        const setPct = (p) => {
            pct = Math.max(0, Math.min(100, p));
            overlay.style.width = `${pct}%`;
            handle.style.left = `${pct}%`;
            container.setAttribute('aria-valuenow', String(Math.round(pct)));
        };

        const syncImageSize = () => {
            innerImg.style.width = `${container.getBoundingClientRect().width}px`;
        };
        innerImg.onload = syncImageSize;
        window.addEventListener('resize', syncImageSize);
        syncImageSize();
        setPct(50);

        const pointerX = (e) => {
            const rect = container.getBoundingClientRect();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            setPct((x / rect.width) * 100);
        };

        let sliding = false;
        container.addEventListener('mousedown', (e) => { sliding = true; pointerX(e); });
        container.addEventListener('touchstart', (e) => { sliding = true; pointerX(e); }, { passive: true });
        window.addEventListener('mouseup', () => { sliding = false; });
        window.addEventListener('touchend', () => { sliding = false; });
        window.addEventListener('mousemove', (e) => { if (sliding) pointerX(e); });
        window.addEventListener('touchmove', (e) => { if (sliding) pointerX(e); }, { passive: true });

        container.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); setPct(pct - 5); }
            if (e.key === 'ArrowRight') { e.preventDefault(); setPct(pct + 5); }
            if (e.key === 'Home') { e.preventDefault(); setPct(0); }
            if (e.key === 'End') { e.preventDefault(); setPct(100); }
        });
    }

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
