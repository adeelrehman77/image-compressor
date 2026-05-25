(function () {
    'use strict';

    const { toast, formatBytes, downloadBlob, loadJsZip, bindDropZone, runWhenReady } = window.NexusTools;

    let heic2anyLoaded = false;
    let heic2anyPromise = null;

    function loadHeic2Any() {
        if (heic2anyLoaded && typeof heic2any !== 'undefined') return Promise.resolve();
        if (heic2anyPromise) return heic2anyPromise;
        heic2anyPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
            s.crossOrigin = 'anonymous';
            s.onload = () => { heic2anyLoaded = true; resolve(); };
            s.onerror = () => reject(new Error('Failed to load HEIC converter library. Check your internet connection.'));
            document.head.appendChild(s);
        });
        return heic2anyPromise;
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
        const dropZone = document.getElementById('heic-drop');
        if (!dropZone) return;

        const fileInput    = document.getElementById('heic-input');
        const formatSelect = document.getElementById('heic-output-format');
        const convertBtn   = document.getElementById('heic-convert-btn');
        const dlAllBtn     = document.getElementById('heic-download-all-btn');
        const fileList     = document.getElementById('heic-file-list');
        const emptyState   = document.getElementById('heic-empty');

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
                toast('Please drop HEIC or HEIF files (iPhone photos).', 'warn');
                return;
            }
            valid.forEach((f) => {
                const id = `heic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const item = { id, file: f, status: 'pending', blob: null, url: null };
                fileItems.push(item);
                renderItem(item);
            });
            emptyState?.classList.add('is-hidden');
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
                <span class="heic-badge status-badge status-ready">Ready</span>
                <span class="heic-output-size is-hidden"></span>
                <div class="heic-actions">
                    <a class="btn-link heic-dl-btn is-hidden" download>Save</a>
                    <button type="button" class="btn-link heic-remove-btn">Remove</button>
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
            if (!fileItems.length) emptyState?.classList.remove('is-hidden');
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
            try {
                await loadHeic2Any();
            } catch (err) {
                toast(err.message, 'error');
                if (convertBtn) convertBtn.disabled = false;
                return;
            }
            const pending = fileItems.filter((f) => f.status !== 'done');
            for (const item of pending) {
                await convertOne(item);
            }
            syncDlAllBtn();
            if (convertBtn) convertBtn.disabled = false;
        }

        async function convertOne(item) {
            setBadge(item, 'status-processing', 'Converting…');
            item.status = 'processing';
            try {
                const result = await heic2any({ blob: item.file, toType: outputFormat, quality: 0.92 });
                const resultBlob = Array.isArray(result) ? result[0] : result;
                item.blob = resultBlob;
                item.url = URL.createObjectURL(resultBlob);
                item.status = 'done';

                const ext = mimeToExt(outputFormat);
                const outName = item.file.name.replace(/\.(heic|heif)$/i, `.${ext}`);

                setBadge(item, 'status-success', '✓ Done');

                const li = document.getElementById(item.id);
                if (li) {
                    const sizeEl = li.querySelector('.heic-output-size');
                    if (sizeEl) {
                        const saved = Math.round((1 - resultBlob.size / item.file.size) * 100);
                        sizeEl.textContent = `→ ${formatBytes(resultBlob.size)}${saved > 0 ? ` (${saved}% smaller)` : ''}`;
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
                setBadge(item, 'status-error', 'Error');
                toast(`${item.file.name}: ${err.message || 'Conversion failed'}`, 'error');
            }
        }

        async function downloadAll() {
            const done = fileItems.filter((f) => f.status === 'done');
            if (!done.length) { toast('No converted files yet. Click "Convert" first.', 'warn'); return; }
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
            } catch (err) {
                toast('Failed to build ZIP.', 'error');
            }
        }

        function syncDlAllBtn() {
            if (!dlAllBtn) return;
            dlAllBtn.classList.toggle('is-hidden', !fileItems.some((f) => f.status === 'done'));
        }
    });
})();
