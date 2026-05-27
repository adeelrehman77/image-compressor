(function () {
    'use strict';

    const { toast, downloadBlob, bindDropZone, runWhenReady, ensureCropper } = window.NexusTools;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    const ACCEPTED = /^image\/(jpeg|png|webp)$/i;
    const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

    let cropper = null;
    let currentFile = null;
    let objectUrl = null;

    function isAccepted(file) {
        return ACCEPTED.test(file.type) || ACCEPTED_EXT.test(file.name || '');
    }

    function releaseUrl() {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
    }

    function setWorkspaceVisible(visible) {
        document.getElementById('crop-drop-zone')?.classList.toggle('is-hidden', visible);
        document.getElementById('crop-workspace')?.classList.toggle('is-hidden', !visible);
        document.getElementById('crop-download-btn').disabled = !visible;
        document.getElementById('crop-compress-btn').disabled = !visible;
    }

    function updateDimensions() {
        const el = document.getElementById('crop-dimensions');
        if (!el || !cropper) {
            if (el) el.textContent = '—';
            return;
        }
        const d = cropper.getData(true);
        const w = Math.round(d.width);
        const h = Math.round(d.height);
        el.textContent = `${w} × ${h} px`;
    }

    function destroyCropper() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    }

    function applyAspect() {
        const sel = document.getElementById('crop-aspect');
        const customWrap = document.getElementById('crop-custom-size');
        if (!sel || !cropper) return;
        const val = sel.value;
        customWrap?.classList.toggle('is-hidden', val !== 'custom');
        if (val === 'free') {
            cropper.setAspectRatio(NaN);
        } else if (val === 'custom') {
            const w = parseInt(document.getElementById('crop-custom-w')?.value, 10) || 1;
            const h = parseInt(document.getElementById('crop-custom-h')?.value, 10) || 1;
            cropper.setAspectRatio(w / h);
        } else {
            cropper.setAspectRatio(parseFloat(val));
        }
        updateDimensions();
    }

    async function loadFile(file) {
        if (!isAccepted(file)) {
            toast(tf('cropNeedImage', null, 'Please use a JPEG, PNG, or WebP image.'), 'warn');
            return;
        }
        await ensureCropper();
        currentFile = file;
        releaseUrl();
        destroyCropper();
        const img = document.getElementById('crop-image');
        if (!img) return;
        objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        setWorkspaceVisible(true);
        img.onload = () => {
            destroyCropper();
            cropper = new window.Cropper(img, {
                viewMode: 1,
                dragMode: 'crop',
                autoCropArea: 0.9,
                responsive: true,
                restore: false,
                checkOrientation: true,
                crop() {
                    updateDimensions();
                },
            });
            applyAspect();
        };
    }

    async function exportCroppedBlob() {
        if (!cropper) throw new Error('No image loaded');
        const format = document.getElementById('crop-output-format')?.value || 'image/jpeg';
        const quality = (parseInt(document.getElementById('crop-quality')?.value, 10) || 90) / 100;
        const canvas = cropper.getCroppedCanvas({
            maxWidth: 8192,
            maxHeight: 8192,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });
        return new Promise((resolve, reject) => {
            if (canvas.convertToBlob) {
                const opts = { type: format };
                if (format === 'image/jpeg' || format === 'image/webp') opts.quality = quality;
                canvas.convertToBlob(opts).then(resolve).catch(reject);
                return;
            }
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('Export failed'))),
                format,
                format === 'image/png' ? undefined : quality
            );
        });
    }

    function outputFilename(blob) {
        const base = (currentFile?.name || 'crop').replace(/\.[^.]+$/, '');
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        return `${base}-cropped.${ext}`;
    }

    runWhenReady(() => {
        const dropZone = document.getElementById('crop-drop-zone');
        const fileInput = document.getElementById('crop-file-input');
        if (!dropZone) return;

        bindDropZone(dropZone, fileInput, (files) => {
            const f = [...files].find(isAccepted);
            if (f) loadFile(f);
            else if (files.length) toast(tf('cropNeedImage', null, 'Please use a JPEG, PNG, or WebP image.'), 'warn');
        });

        fileInput?.addEventListener('change', () => {
            if (fileInput.files?.[0]) {
                loadFile(fileInput.files[0]);
                fileInput.value = '';
            }
        });

        document.getElementById('crop-aspect')?.addEventListener('change', applyAspect);
        ['crop-custom-w', 'crop-custom-h'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => {
                if (document.getElementById('crop-aspect')?.value === 'custom') applyAspect();
            });
        });

        document.getElementById('crop-quality')?.addEventListener('input', (e) => {
            const v = document.getElementById('crop-quality-val');
            if (v) v.textContent = `${e.target.value}%`;
        });

        document.getElementById('crop-rotate-left')?.addEventListener('click', () => cropper?.rotate(-90));
        document.getElementById('crop-rotate-right')?.addEventListener('click', () => cropper?.rotate(90));
        document.getElementById('crop-flip-h')?.addEventListener('click', () => {
            const d = cropper?.getData();
            if (d) cropper.scaleX(d.scaleX > 0 ? -1 : 1);
        });
        document.getElementById('crop-flip-v')?.addEventListener('click', () => {
            const d = cropper?.getData();
            if (d) cropper.scaleY(d.scaleY > 0 ? -1 : 1);
        });
        document.getElementById('crop-reset')?.addEventListener('click', () => cropper?.reset());

        document.getElementById('crop-download-btn')?.addEventListener('click', async () => {
            try {
                const blob = await exportCroppedBlob();
                downloadBlob(blob, outputFilename(blob), 'image-cropper');
                toast(tf('cropDownloaded', null, 'Cropped image downloaded.'), 'success');
            } catch (err) {
                toast(err.message || 'Crop failed', 'error');
            }
        });

        document.getElementById('crop-compress-btn')?.addEventListener('click', async () => {
            try {
                const blob = await exportCroppedBlob();
                const file = new File([blob], outputFilename(blob), { type: blob.type });
                if (window.__NEXUS_NAVIGATE_TOOL) await window.__NEXUS_NAVIGATE_TOOL('compress');
                window.__NEXUS_COMPRESS_ADD_FILES?.([file]);
                toast(tf('cropSentCompress', null, 'Cropped image added to compressor queue.'), 'success');
            } catch (err) {
                toast(err.message || 'Crop failed', 'error');
            }
        });
    });

    window.__NEXUS_CROPPER_LOAD_FILE = loadFile;
})();
