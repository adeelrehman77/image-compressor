(function () {
    'use strict';

    const { toast, formatBytes, downloadBlob, loadJsZip, bindDropZone, runWhenReady } = window.NexusTools;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    const ACCEPTED_TYPES = /^image\/(jpeg|png|webp|avif|gif)$/i;
    const ACCEPTED_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function mimeToExt(mime) {
        const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
        return map[mime] || 'jpg';
    }

    function isAccepted(file) {
        return ACCEPTED_TYPES.test(file.type) || ACCEPTED_EXT.test(file.name);
    }

    function originalFormatLabel(file) {
        if (file.type) {
            const m = file.type.match(/image\/(\w+)/);
            if (m) return m[1].toUpperCase().replace('JPEG', 'JPG');
        }
        const ext = file.name.match(/\.(\w+)$/);
        return ext ? ext[1].toUpperCase() : 'IMG';
    }

    const fileItems = [];
    let outputFormat = 'image/webp';

    runWhenReady(() => {
        const dropZone = document.getElementById('fmt-drop-zone');
        if (!dropZone) return;

        const fileInput = document.getElementById('fmt-file-input');
        const formatSelect = document.getElementById('fmt-output-format');
        const convertBtn = document.getElementById('fmt-convert-btn');
        const dlAllBtn = document.getElementById('fmt-download-zip-btn');
        const fileList = document.getElementById('fmt-file-list');

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
            const valid = incoming.filter(isAccepted);
            if (!valid.length) {
                toast(tf('fmtToastNeedImages', null, 'Please drop JPEG, PNG, WebP, AVIF, or GIF files.'), 'warn');
                return;
            }
            valid.forEach((f) => {
                const id = `fconv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
            const fmt = originalFormatLabel(item.file);
            li.innerHTML = `
                <span class="heic-file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
                <span class="heic-file-size">${formatBytes(item.file.size)} · <strong>${fmt}</strong></span>
                <span class="fconv-badge status-badge status-ready">${escapeHtml(tf('statusReady', null, 'Ready'))}</span>
                <span class="heic-output-size is-hidden"></span>
                <div class="heic-actions">
                    <a class="btn-link fconv-dl-btn is-hidden" download>${escapeHtml(tf('save', null, 'Save'))}</a>
                    <button type="button" class="btn-link fconv-remove-btn">${escapeHtml(tf('remove', null, 'Remove'))}</button>
                </div>
            `;
            li.querySelector('.fconv-remove-btn').addEventListener('click', () => {
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
            const badge = li.querySelector('.fconv-badge');
            if (badge) { badge.className = `fconv-badge status-badge ${cls}`; badge.textContent = text; }
        }

        async function convertOne(item) {
            setBadge(item, 'status-processing', tf('statusConverting', null, 'Converting…'));
            item.status = 'processing';
            try {
                let blob;
                if (typeof OffscreenCanvas !== 'undefined') {
                    const bmp = await createImageBitmap(item.file);
                    const w = Math.max(1, bmp.width | 0);
                    const h = Math.max(1, bmp.height | 0);
                    const oc = new OffscreenCanvas(w, h);
                    oc.getContext('2d').drawImage(bmp, 0, 0);
                    bmp.close();
                    blob = await oc.convertToBlob({ type: outputFormat, quality: 0.92 });
                } else {
                    blob = await fallbackConvert(item.file, outputFormat);
                }

                item.blob = blob;
                item.url = URL.createObjectURL(blob);
                item.status = 'done';

                const ext = mimeToExt(outputFormat);
                const baseName = item.file.name.replace(/\.[^.]+$/, '');
                const outName = `${baseName}.${ext}`;

                setBadge(item, 'status-success', tf('statusDone', null, '✓ Done'));

                const li = document.getElementById(item.id);
                if (li) {
                    const sizeEl = li.querySelector('.heic-output-size');
                    if (sizeEl) {
                        const saved = Math.round((1 - blob.size / item.file.size) * 100);
                        let suffix = '';
                        if (saved > 0) suffix = tf('outputSmaller', { pct: saved }, ` (${saved}% smaller)`);
                        else if (saved < 0) suffix = tf('outputLarger', { pct: Math.abs(saved) }, ` (${Math.abs(saved)}% larger)`);
                        sizeEl.textContent = `→ ${formatBytes(blob.size)}${suffix}`;
                        sizeEl.classList.remove('is-hidden');
                    }
                    const dlBtn = li.querySelector('.fconv-dl-btn');
                    if (dlBtn) {
                        dlBtn.href = item.url;
                        dlBtn.download = outName;
                        dlBtn.classList.remove('is-hidden');
                    }
                }
            } catch (err) {
                item.status = 'error';
                setBadge(item, 'status-error', tf('statusError', null, 'Error'));
                toast(`${item.file.name}: ${err.message || tf('convertFailed', null, 'Conversion failed')}`, 'error');
            }
        }

        function fallbackConvert(file, mimeType) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), mimeType, 0.92);
                };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
                img.src = url;
            });
        }

        async function convertAll() {
            if (convertBtn) convertBtn.disabled = true;
            const pending = fileItems.filter((f) => f.status !== 'done');
            for (const item of pending) {
                await convertOne(item);
            }
            syncDlAllBtn();
            if (convertBtn) convertBtn.disabled = false;
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
                downloadBlob(item.blob, `${item.file.name.replace(/\.[^.]+$/, '')}.${ext}`, 'format-converter');
                return;
            }
            try {
                const JSZip = await loadJsZip();
                const zip = new JSZip();
                const ext = mimeToExt(outputFormat);
                done.forEach((item) => {
                    zip.file(`${item.file.name.replace(/\.[^.]+$/, '')}.${ext}`, item.blob);
                });
                const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
                downloadBlob(zipBlob, 'converted-images.zip', 'format-converter');
            } catch {
                toast(tf('zipBuildFailed', null, 'Failed to build ZIP.'), 'error');
            }
        }

        function syncDlAllBtn() {
            if (!dlAllBtn) return;
            dlAllBtn.classList.toggle('is-hidden', !fileItems.some((f) => f.status === 'done'));
        }

        window.__NEXUS_FMT_ADD_FILES = addFiles;
    });
})();
