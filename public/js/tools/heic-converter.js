(function () {
    'use strict';

    const { toast, formatBytes, downloadBlob, loadJsZip, bindDropZone, runWhenReady, assetUrl } = window.NexusTools;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    let heicModulePromise = null;

    /** CSP-safe libheif build (no unsafe-eval); lazy-loaded from vendor/. */
    function loadHeicTo() {
        if (heicModulePromise) return heicModulePromise;
        const src = assetUrl('vendor/heic-to-csp.min.js');
        const abs = new URL(src, window.location.href).href;
        heicModulePromise = import(abs).catch((err) => {
            heicModulePromise = null;
            throw new Error(
                tf('heicLibLoadFail', null, 'Failed to load HEIC converter library. Check your internet connection.')
                + (err?.message ? ` (${err.message})` : '')
            );
        });
        return heicModulePromise;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function isHeicFile(file) {
        return /\.(heic|heif)$/i.test(file.name) ||
               file.type === 'image/heic' ||
               file.type === 'image/heif';
    }

    function mimeToExt(mime) {
        if (mime === 'image/jpeg') return 'jpg';
        if (mime === 'image/png') return 'png';
        if (mime === 'image/webp') return 'webp';
        return 'jpg';
    }

    const fileItems = [];
    let outputFormat = 'image/jpeg';

    runWhenReady(() => {
        const dropZone = document.getElementById('heic-drop-zone');
        if (!dropZone) return;

        const fileInput = document.getElementById('heic-file-input');
        const formatSelect = document.getElementById('heic-output-format');
        const convertBtn = document.getElementById('heic-convert-btn');
        const dlAllBtn = document.getElementById('heic-download-zip-btn');
        const fileList = document.getElementById('heic-file-list');

        formatSelect?.addEventListener('change', () => { outputFormat = formatSelect.value; });

        bindDropZone(dropZone, fileInput, (files) => addFiles(Array.from(files)));

        fileInput?.addEventListener('change', () => {
            if (fileInput.files.length) {
                addFiles(Array.from(fileInput.files));
                fileInput.value = '';
            }
        });

        convertBtn?.addEventListener('click', convertAll);
        dlAllBtn?.addEventListener('click', downloadAll);

        function addFiles(incoming) {
            const valid = incoming.filter(isHeicFile);
            if (!valid.length) {
                toast(tf('heicToastNeedHeic', null, 'Please drop HEIC or HEIF files (iPhone photos).'), 'warn');
                return;
            }
            valid.forEach((f) => {
                const id = `heic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const item = { id, file: f, status: 'pending', blob: null, url: null };
                fileItems.push(item);
                renderItem(item);
            });
            fileList?.classList.remove('is-hidden');
            if (convertBtn) convertBtn.disabled = false;
            syncDlAllBtn();
        }

        function renderItem(item) {
            const li = document.createElement('li');
            li.id = item.id;
            li.className = 'heic-file-item';
            li.innerHTML = `
                <span class="heic-file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
                <span class="heic-file-size">${formatBytes(item.file.size)}</span>
                <span class="heic-badge status-badge status-ready">${escapeHtml(tf('statusReady', null, 'Ready'))}</span>
                <span class="heic-output-size is-hidden"></span>
                <div class="heic-actions">
                    <a class="btn-link heic-dl-btn is-hidden" download>${escapeHtml(tf('save', null, 'Save'))}</a>
                    <button type="button" class="btn-link heic-remove-btn">${escapeHtml(tf('remove', null, 'Remove'))}</button>
                </div>
            `;
            li.querySelector('.heic-remove-btn').addEventListener('click', () => {
                removeItem(item.id);
                li.remove();
            });
            fileList?.appendChild(li);
        }

        function removeItem(id) {
            const idx = fileItems.findIndex((f) => f.id === id);
            if (idx === -1) return;
            const item = fileItems[idx];
            if (item.url) URL.revokeObjectURL(item.url);
            fileItems.splice(idx, 1);
            if (!fileItems.length) fileList?.classList.add('is-hidden');
            syncDlAllBtn();
        }

        function setBadge(item, cls, text) {
            const li = document.getElementById(item.id);
            if (!li) return;
            const badge = li.querySelector('.heic-badge');
            if (badge) { badge.className = `heic-badge status-badge ${cls}`; badge.textContent = text; }
        }

        async function convertAll() {
            if (convertBtn) convertBtn.disabled = true;
            let heicTo;
            try {
                ({ heicTo } = await loadHeicTo());
            } catch (err) {
                toast(err.message, 'error');
                if (convertBtn) convertBtn.disabled = false;
                return;
            }
            const pending = fileItems.filter((f) => f.status !== 'done');
            for (const item of pending) {
                await convertOne(item, heicTo);
            }
            syncDlAllBtn();
            if (convertBtn) convertBtn.disabled = false;
        }

        async function convertOne(item, heicTo) {
            setBadge(item, 'status-processing', tf('statusConverting', null, 'Converting…'));
            item.status = 'processing';
            try {
                const resultBlob = await heicTo({
                    blob: item.file,
                    type: outputFormat,
                    quality: outputFormat === 'image/png' ? undefined : 0.92,
                });
                item.blob = resultBlob;
                item.url = URL.createObjectURL(resultBlob);
                item.status = 'done';

                const ext = mimeToExt(outputFormat);
                const outName = item.file.name.replace(/\.(heic|heif)$/i, `.${ext}`);

                setBadge(item, 'status-success', tf('statusDone', null, '✓ Done'));

                const li = document.getElementById(item.id);
                if (li) {
                    const sizeEl = li.querySelector('.heic-output-size');
                    if (sizeEl) {
                        const saved = Math.round((1 - resultBlob.size / item.file.size) * 100);
                        const smaller = saved > 0
                            ? tf('outputSmaller', { pct: saved }, ` (${saved}% smaller)`)
                            : '';
                        sizeEl.textContent = `→ ${formatBytes(resultBlob.size)}${smaller}`;
                        sizeEl.classList.remove('is-hidden');
                    }
                    const dlBtn = li.querySelector('.heic-dl-btn');
                    if (dlBtn) {
                        dlBtn.href = item.url;
                        dlBtn.download = outName;
                        dlBtn.classList.remove('is-hidden');
                    }
                }
            } catch (err) {
                item.status = 'error';
                setBadge(item, 'status-error', tf('statusError', null, 'Error'));
                window.NexusSentry?.captureException?.(err, {
                    tool: 'heic-converter',
                    fileName: item.file?.name,
                });
                toast(`${item.file.name}: ${err.message || tf('convertFailed', null, 'Conversion failed')}`, 'error');
            }
        }

        async function downloadAll() {
            const done = fileItems.filter((f) => f.status === 'done');
            if (!done.length) {
                toast(tf('toastNoConverted', null, 'No converted files yet. Click "Convert all" first.'), 'warn');
                return;
            }
            if (done.length === 1) {
                const item = done[0];
                const ext = mimeToExt(outputFormat);
                downloadBlob(item.blob, item.file.name.replace(/\.(heic|heif)$/i, `.${ext}`), 'heic-converter');
                return;
            }
            try {
                const JSZip = await loadJsZip();
                const zip = new JSZip();
                const ext = mimeToExt(outputFormat);
                done.forEach((item) => {
                    zip.file(item.file.name.replace(/\.(heic|heif)$/i, `.${ext}`), item.blob);
                });
                const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
                downloadBlob(zipBlob, 'heic-converted.zip', 'heic-converter');
            } catch {
                toast(tf('zipBuildFailed', null, 'Failed to build ZIP.'), 'error');
            }
        }

        function syncDlAllBtn() {
            if (!dlAllBtn) return;
            dlAllBtn.classList.toggle('is-hidden', !fileItems.some((f) => f.status === 'done'));
        }
    });
})();
