(function () {
    'use strict';

    const { toast, formatBytes, downloadBlob, loadJsZip, bindDropZone, runWhenReady } = window.NexusTools;

    const ACCEPTED_TYPES = /^image\/(jpeg|png|webp|avif|gif)$/i;
    const ACCEPTED_EXT   = /\.(jpe?g|png|webp|avif|gif)$/i;

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
        const dropZone  = document.getElementById('fconv-drop');
        if (!dropZone) return;

        const fileInput    = document.getElementById('fconv-input');
        const formatSelect = document.getElementById('fconv-output-format');
        const convertBtn   = document.getElementById('fconv-convert-btn');
        const dlAllBtn     = document.getElementById('fconv-download-all-btn');
        const fileList     = document.getElementById('fconv-file-list');
        const emptyState   = document.getElementById('fconv-empty');

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
                toast('Please drop JPEG, PNG, WebP, AVIF, or GIF files.', 'warn');
                return;
            }
            valid.forEach((f) => {
                const id = `fconv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
            const fmt = originalFormatLabel(item.file);
            li.innerHTML = `
                <span class="heic-file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
                <span class="heic-file-size">${formatBytes(item.file.size)} · <strong>${fmt}</strong></span>
                <span class="fconv-badge status-badge status-ready">Ready</span>
                <span class="heic-output-size is-hidden"></span>
                <div class="heic-actions">
                    <a class="btn-link fconv-dl-btn is-hidden" download>Save</a>
                    <button type="button" class="btn-link fconv-remove-btn">Remove</button>
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
            if (!fileItems.length) emptyState?.classList.remove('is-hidden');
            syncDlAllBtn();
        }

        function setBadge(item, cls, text) {
            const li = document.getElementById(item.id);
            if (!li) return;
            const badge = li.querySelector('.fconv-badge');
            if (badge) { badge.className = `fconv-badge status-badge ${cls}`; badge.textContent = text; }
        }

        async function convertOne(item) {
            setBadge(item, 'status-processing', 'Converting…');
            item.status = 'processing';
            try {
                let blob;
                if (typeof OffscreenCanvas !== 'undefined') {
                    const bmp = await createImageBitmap(item.file);
                    const oc = new OffscreenCanvas(bmp.width, bmp.height);
                    oc.getContext('2d').drawImage(bmp, 0, 0);
                    bmp.close();
                    blob = await oc.convertToBlob({ type: outputFormat, quality: 0.92 });
                } else {
                    blob = await fallbackConvert(item.file, outputFormat);
                }

                item.blob = blob;
                item.url  = URL.createObjectURL(blob);
                item.status = 'done';

                const ext = mimeToExt(outputFormat);
                const baseName = item.file.name.replace(/\.[^.]+$/, '');
                const outName  = `${baseName}.${ext}`;

                setBadge(item, 'status-success', '✓ Done');

                const li = document.getElementById(item.id);
                if (li) {
                    const sizeEl = li.querySelector('.heic-output-size');
                    if (sizeEl) {
                        const saved = Math.round((1 - blob.size / item.file.size) * 100);
                        sizeEl.textContent = `→ ${formatBytes(blob.size)}${saved > 0 ? ` (${saved}% smaller)` : saved < 0 ? ` (${Math.abs(saved)}% larger)` : ''}`;
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
                setBadge(item, 'status-error', 'Error');
                toast(`${item.file.name}: ${err.message || 'Conversion failed'}`, 'error');
            }
        }

        function fallbackConvert(file, mimeType) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width  = img.naturalWidth;
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
            if (!done.length) { toast('No converted files yet. Click "Convert" first.', 'warn'); return; }
            if (done.length === 1) {
                const item = done[0];
                const ext = mimeToExt(outputFormat);
                downloadBlob(item.blob, `${item.file.name.replace(/\.[^.]+$/, '')}.${ext}`, 'format-converter');
                return;
            }
            try {
                const JSZip = await loadJsZip();
                const zip   = new JSZip();
                const ext   = mimeToExt(outputFormat);
                done.forEach((item) => {
                    zip.file(`${item.file.name.replace(/\.[^.]+$/, '')}.${ext}`, item.blob);
                });
                const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
                downloadBlob(zipBlob, 'converted-images.zip', 'format-converter');
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
