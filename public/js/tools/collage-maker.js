(function () {
    'use strict';

    const { toast, downloadBlob, runWhenReady } = window.NexusTools;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    const state = {
        layout: '2h',
        canvasW: 1200,
        canvasH: 600,
        gap: 8,
        radius: 0,
        bg: '#ffffff',
        fmt: 'jpeg',
        images: {},
    };

    let activeSlotIndex = null;
    let canvas = null;
    let ctx = null;
    let resizeObserver = null;

    function getSlots(layout, W, H, gap) {
        const g = gap;
        switch (layout) {
            case '2h':
                return [
                    { x: 0, y: 0, w: (W - g) / 2, h: H },
                    { x: (W - g) / 2 + g, y: 0, w: (W - g) / 2, h: H },
                ];
            case '2v':
                return [
                    { x: 0, y: 0, w: W, h: (H - g) / 2 },
                    { x: 0, y: (H - g) / 2 + g, w: W, h: (H - g) / 2 },
                ];
            case '3h': {
                const w = (W - 2 * g) / 3;
                return [
                    { x: 0, y: 0, w, h: H },
                    { x: w + g, y: 0, w, h: H },
                    { x: 2 * (w + g), y: 0, w, h: H },
                ];
            }
            case '3v': {
                const h = (H - 2 * g) / 3;
                return [
                    { x: 0, y: 0, w: W, h },
                    { x: 0, y: h + g, w: W, h },
                    { x: 0, y: 2 * (h + g), w: W, h },
                ];
            }
            case '4': {
                const hw = (W - g) / 2;
                const hh = (H - g) / 2;
                return [
                    { x: 0, y: 0, w: hw, h: hh },
                    { x: hw + g, y: 0, w: hw, h: hh },
                    { x: 0, y: hh + g, w: hw, h: hh },
                    { x: hw + g, y: hh + g, w: hw, h: hh },
                ];
            }
            case 'left': {
                const rw = (W - g) * 0.38;
                const lw = W - rw - g;
                const hh = (H - g) / 2;
                return [
                    { x: 0, y: 0, w: lw, h: H },
                    { x: lw + g, y: 0, w: rw, h: hh },
                    { x: lw + g, y: hh + g, w: rw, h: hh },
                ];
            }
            case 'right': {
                const lw = (W - g) * 0.38;
                const rw = W - lw - g;
                const hh = (H - g) / 2;
                return [
                    { x: 0, y: 0, w: lw, h: hh },
                    { x: 0, y: hh + g, w: lw, h: hh },
                    { x: lw + g, y: 0, w: rw, h: H },
                ];
            }
            case 'top': {
                const bh = (H - g) * 0.38;
                const th = H - bh - g;
                const hw = (W - g) / 2;
                return [
                    { x: 0, y: 0, w: hw, h: th },
                    { x: hw + g, y: 0, w: hw, h: th },
                    { x: 0, y: th + g, w: W, h: bh },
                ];
            }
            default:
                return [];
        }
    }

    function roundRect(c, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
    }

    function drawFit(c, img, x, y, w, h, fit, zoom = 1.0, offsetX = 0, offsetY = 0) {
        let actualFit = fit;
        if (fit === 'auto') {
            const rImg = img.width / img.height;
            const rSlot = w / h;
            const isImgPortrait = rImg < 0.9;
            const isSlotPortrait = rSlot < 0.9;
            const isImgLandscape = rImg > 1.1;
            const isSlotLandscape = rSlot > 1.1;
            
            if ((isImgPortrait && !isSlotPortrait) || (isImgLandscape && !isSlotLandscape)) {
                actualFit = 'contain';
            } else {
                const ratioDiff = Math.max(rImg / rSlot, rSlot / rImg);
                if (ratioDiff > 1.25) {
                    actualFit = 'contain';
                } else {
                    actualFit = 'cover';
                }
            }
        }

        let scale = 1.0;
        if (actualFit === 'cover') {
            scale = Math.max(w / img.width, h / img.height);
        } else {
            scale = Math.min(w / img.width, h / img.height);
        }

        scale *= zoom;

        const sw = img.width * scale;
        const sh = img.height * scale;

        const dx = x + (w - sw) / 2 + offsetX;
        const dy = y + (h - sh) / 2 + offsetY;

        c.drawImage(img, dx, dy, sw, sh);
    }

    function setStatus(msg, type) {
        const el = document.getElementById('collage-status-msg');
        if (!el) return;
        el.textContent = msg;
        el.classList.toggle('is-ok', type === 'ok');
        el.classList.toggle('is-err', type === 'err');
    }

    function selectSlot(i) {
        activeSlotIndex = i;
        const slots = document.querySelectorAll('.collage-slot');
        slots.forEach((s) => {
            s.classList.toggle('is-selected', s.dataset.index === String(i));
        });

        const card = document.getElementById('collage-slot-settings-card');
        if (card) {
            card.classList.remove('is-hidden');
            const header = card.querySelector('[data-settings-toggle]');
            const body = card.querySelector('.settings-card__body');
            const chevron = card.querySelector('.settings-chevron');
            if (header && body) {
                header.setAttribute('aria-expanded', 'true');
                body.classList.remove('is-collapsed');
                chevron?.classList.add('is-open');
            }
        }

        const title = document.getElementById('collage-slot-settings-title');
        if (title) {
            title.textContent = tf('collageSlotSettingsTitleN', { n: i + 1 }, `Photo ${i + 1} Settings`);
        }

        updateSlotSettingsUI();
    }

    function updateSlotSettingsUI() {
        if (activeSlotIndex === null || !state.images[activeSlotIndex]) {
            const card = document.getElementById('collage-slot-settings-card');
            card?.classList.add('is-hidden');
            return;
        }

        const imgData = state.images[activeSlotIndex];
        const fitSelect = document.getElementById('collage-slot-fit-select');
        const zoomSlider = document.getElementById('collage-slot-zoom');
        const zoomVal = document.getElementById('collage-slot-zoom-val');

        if (fitSelect) {
            fitSelect.value = imgData.fit || 'auto';
        }
        if (zoomSlider) {
            zoomSlider.value = Math.round((imgData.zoom || 1.0) * 100);
        }
        if (zoomVal) {
            zoomVal.textContent = `${Math.round((imgData.zoom || 1.0) * 100)}%`;
        }
    }

    function buildSlotOverlay() {
        const overlay = document.getElementById('collage-slots-overlay');
        if (!overlay) return;

        const slots = getSlots(state.layout, state.canvasW, state.canvasH, state.gap);
        const W = state.canvasW;
        const H = state.canvasH;

        overlay.innerHTML = '';

        slots.forEach((s, i) => {
            const div = document.createElement('div');
            const hasImage = !!state.images[i];
            div.className = 'collage-slot' + (hasImage ? ' is-filled' : ' is-empty');
            if (hasImage && activeSlotIndex === i) {
                div.classList.add('is-selected');
            }
            div.dataset.index = String(i);
            div.style.left = `${((s.x / W) * 100).toFixed(3)}%`;
            div.style.top = `${((s.y / H) * 100).toFixed(3)}%`;
            div.style.width = `${((s.w / W) * 100).toFixed(3)}%`;
            div.style.height = `${((s.h / H) * 100).toFixed(3)}%`;

            if (!hasImage) {
                const icon = document.createElement('span');
                icon.className = 'collage-slot-icon';
                icon.textContent = '+';
                icon.setAttribute('aria-hidden', 'true');
                div.appendChild(icon);
                div.addEventListener('click', () => openFilePicker(i));
            } else {
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'collage-slot-remove btn-ghost btn-sm';
                rm.textContent = '✕';
                rm.setAttribute('aria-label', tf('collageRemovePhoto', { n: i + 1 }, 'Remove photo'));
                rm.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeSlot(i);
                });
                div.appendChild(rm);

                div.addEventListener('click', () => {
                    selectSlot(i);
                });

                let isPanning = false;
                let startX = 0;
                let startY = 0;
                let startOffsetX = 0;
                let startOffsetY = 0;

                div.style.cursor = 'grab';

                div.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    isPanning = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    startOffsetX = state.images[i].offsetX || 0;
                    startOffsetY = state.images[i].offsetY || 0;
                    div.style.cursor = 'grabbing';
                    div.setPointerCapture(e.pointerId);
                    selectSlot(i);
                });

                div.addEventListener('pointermove', (e) => {
                    if (!isPanning) return;
                    e.preventDefault();
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;

                    const rect = canvas.getBoundingClientRect();
                    const scaleX = W / rect.width;
                    const scaleY = H / rect.height;

                    state.images[i].offsetX = startOffsetX + dx * scaleX;
                    state.images[i].offsetY = startOffsetY + dy * scaleY;

                    redrawCanvas();
                });

                const stopPanning = (e) => {
                    if (!isPanning) return;
                    isPanning = false;
                    div.style.cursor = 'grab';
                    try {
                        div.releasePointerCapture(e.pointerId);
                    } catch (err) {}
                    updateSlotSettingsUI();
                };

                div.addEventListener('pointerup', stopPanning);
                div.addEventListener('pointercancel', stopPanning);
            }

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                div.classList.add('is-drag-over');
            });
            div.addEventListener('dragleave', () => div.classList.remove('is-drag-over'));
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('is-drag-over');
                loadFile(e.dataTransfer.files[0], i);
            });

            overlay.appendChild(div);
        });
    }

    function openFilePicker(slotIndex) {
        activeSlotIndex = slotIndex;
        const fp = document.getElementById('collage-file-picker');
        if (!fp) return;
        fp.value = '';
        fp.click();
    }

    async function loadFile(file, slotIndex) {
        if (!file) return;
        const isHeic = file && (file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name || ''));
        if (isHeic) {
            try {
                toast(tf('heicConverting', null, 'Converting HEIC photo…'), 'info');
                file = await window.NexusTools.convertHeicToJpegFile(file);
            } catch (err) {
                toast(tf('heicConvertFailed', null, 'HEIC conversion failed.'), 'error');
                return;
            }
        }
        if (!file.type.startsWith('image/')) {
            toast(tf('collageNeedImage', null, 'Please use an image file.'), 'warn');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                state.images[slotIndex] = {
                    img: img,
                    zoom: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                    fit: 'auto'
                };
                buildSlotOverlay();
                redrawCanvas();
                selectSlot(slotIndex);
                setStatus(tf('collagePhotoLoaded', { n: slotIndex + 1 }, `Photo ${slotIndex + 1} loaded.`), 'ok');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removeSlot(i) {
        delete state.images[i];
        if (activeSlotIndex === i) {
            activeSlotIndex = null;
            const card = document.getElementById('collage-slot-settings-card');
            card?.classList.add('is-hidden');
        }
        buildSlotOverlay();
        redrawCanvas();
    }

    function redrawCanvas() {
        if (!canvas || !ctx) return;

        const W = state.canvasW;
        const H = state.canvasH;
        canvas.width = W;
        canvas.height = H;

        const outer = document.getElementById('collage-canvas-outer');
        if (outer) {
            const maxW = outer.clientWidth - 40;
            const scale = Math.min(1, maxW / W);
            canvas.style.width = `${Math.round(W * scale)}px`;
            canvas.style.height = `${Math.round(H * scale)}px`;
        }

        ctx.fillStyle = state.bg;
        ctx.fillRect(0, 0, W, H);

        const slots = getSlots(state.layout, W, H, state.gap);
        const fit = document.getElementById('collage-fit-select')?.value || 'auto';

        slots.forEach((s, i) => {
            ctx.save();
            if (state.radius > 0) {
                roundRect(ctx, s.x, s.y, s.w, s.h, state.radius);
                ctx.clip();
            }
            if (state.images[i]) {
                const imgData = state.images[i];
                const img = imgData.img || imgData;
                const zoom = imgData.zoom || 1.0;
                const offsetX = imgData.offsetX || 0;
                const offsetY = imgData.offsetY || 0;
                const slotFit = imgData.fit || 'auto';
                
                const activeFit = fit === 'auto' ? slotFit : fit;
                drawFit(ctx, img, s.x, s.y, s.w, s.h, activeFit, zoom, offsetX, offsetY);
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.06)';
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }
            ctx.restore();
        });
    }

    function setLayout(name, btn) {
        if (Object.keys(state.images).length > 0) {
            const msg = tf('collageLayoutConfirm', null, 'Changing layout will clear all loaded photos. Continue?');
            if (!window.confirm(msg)) return;
        }
        state.layout = name;
        document.querySelectorAll('.collage-layout-btn').forEach((b) => b.classList.remove('is-active'));
        btn?.classList.add('is-active');
        state.images = {};
        activeSlotIndex = null;
        const card = document.getElementById('collage-slot-settings-card');
        card?.classList.add('is-hidden');
        buildSlotOverlay();
        redrawCanvas();
        setStatus(tf('collageStatusHint', null, 'Click any slot to add a photo, or drag images onto it.'), '');
    }

    function applyCanvasPreset(val) {
        const customRow = document.getElementById('collage-custom-size-row');
        if (val === 'custom') {
            customRow?.classList.remove('is-hidden');
            return;
        }
        customRow?.classList.add('is-hidden');
        const [w, h] = val.split('x').map(Number);
        state.canvasW = w;
        state.canvasH = h;
        buildSlotOverlay();
        redrawCanvas();
    }

    function applyCustomSize() {
        const w = parseInt(document.getElementById('collage-custom-w')?.value, 10) || 1200;
        const h = parseInt(document.getElementById('collage-custom-h')?.value, 10) || 600;
        state.canvasW = Math.max(200, Math.min(4000, w));
        state.canvasH = Math.max(200, Math.min(4000, h));
        buildSlotOverlay();
        redrawCanvas();
    }

    function setBg(color, el) {
        state.bg = color;
        document.querySelectorAll('.collage-swatch').forEach((s) => s.classList.remove('is-active'));
        el?.classList.add('is-active');
        redrawCanvas();
    }

    function setFmt(fmt, btn) {
        state.fmt = fmt;
        document.querySelectorAll('.collage-fmt-btn').forEach((b) => b.classList.remove('is-active'));
        btn?.classList.add('is-active');
        document.getElementById('collage-quality-row')?.classList.toggle('is-hidden', fmt === 'png');
    }

    function exportCollage() {
        redrawCanvas();
        const quality = parseInt(document.getElementById('collage-quality')?.value, 10) / 100 || 0.9;
        const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        const extMap = { jpeg: 'jpg', png: 'png', webp: 'webp' };
        const mime = mimeMap[state.fmt];
        const ext = extMap[state.fmt];

        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    toast(tf('collageExportFailed', null, 'Export failed — try a different format.'), 'error');
                    return;
                }
                downloadBlob(blob, `collage.${ext}`, 'collage-maker');
                toast(tf('collageDownloaded', null, 'Collage downloaded!'), 'success');
            },
            mime,
            quality
        );
    }

    function clearAll() {
        state.images = {};
        activeSlotIndex = null;
        const card = document.getElementById('collage-slot-settings-card');
        card?.classList.add('is-hidden');
        buildSlotOverlay();
        redrawCanvas();
        setStatus(tf('collageCleared', null, 'All photos cleared.'), '');
    }

    runWhenReady(() => {
        canvas = document.getElementById('collage-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        document.querySelectorAll('.collage-layout-btn').forEach((btn) => {
            btn.addEventListener('click', () => setLayout(btn.dataset.layout, btn));
        });

        document.getElementById('collage-canvas-preset')?.addEventListener('change', (e) => {
            applyCanvasPreset(e.target.value);
        });

        document.getElementById('collage-custom-apply')?.addEventListener('click', applyCustomSize);

        document.getElementById('collage-gap-slider')?.addEventListener('input', (e) => {
            state.gap = parseInt(e.target.value, 10);
            const val = document.getElementById('collage-gap-val');
            if (val) val.textContent = `${state.gap}px`;
            redrawCanvas();
        });

        document.getElementById('collage-radius-slider')?.addEventListener('input', (e) => {
            state.radius = parseInt(e.target.value, 10);
            const val = document.getElementById('collage-radius-val');
            if (val) val.textContent = `${state.radius}px`;
            redrawCanvas();
        });

        document.querySelectorAll('.collage-swatch').forEach((sw) => {
            sw.addEventListener('click', () => setBg(sw.dataset.color, sw));
        });

        document.getElementById('collage-custom-color')?.addEventListener('input', (e) => {
            state.bg = e.target.value;
            document.querySelectorAll('.collage-swatch').forEach((s) => s.classList.remove('is-active'));
            redrawCanvas();
        });

        document.getElementById('collage-fit-select')?.addEventListener('change', redrawCanvas);

        document.querySelectorAll('.collage-fmt-btn').forEach((btn) => {
            btn.addEventListener('click', () => setFmt(btn.dataset.fmt, btn));
        });

        document.getElementById('collage-quality')?.addEventListener('input', (e) => {
            const val = document.getElementById('collage-quality-val');
            if (val) val.textContent = `${e.target.value}%`;
        });

        document.getElementById('collage-export-btn')?.addEventListener('click', exportCollage);
        document.getElementById('collage-compress-btn')?.addEventListener('click', async () => {
            if (Object.keys(state.images).length === 0) {
                toast(tf('collageNoImages', null, 'Please load some photos first.'), 'warn');
                return;
            }
            redrawCanvas();
            const quality = parseInt(document.getElementById('collage-quality')?.value, 10) / 100 || 0.9;
            const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
            const extMap = { jpeg: 'jpg', png: 'png', webp: 'webp' };
            const mime = mimeMap[state.fmt];
            const ext = extMap[state.fmt];

            canvas.toBlob(
                async (blob) => {
                    if (!blob) {
                        toast(tf('collageExportFailed', null, 'Export failed — try a different format.'), 'error');
                        return;
                    }
                    const file = new File([blob], `collage.${ext}`, { type: mime });
                    if (window.__NEXUS_NAVIGATE_TOOL) await window.__NEXUS_NAVIGATE_TOOL('compress');
                    window.__NEXUS_COMPRESS_ADD_FILES?.([file]);
                    toast(tf('collageSentCompress', null, 'Collage added to compressor queue.'), 'success');
                },
                mime,
                quality
            );
        });

        document.getElementById('collage-slot-fit-select')?.addEventListener('change', (e) => {
            if (activeSlotIndex !== null && state.images[activeSlotIndex]) {
                state.images[activeSlotIndex].fit = e.target.value;
                redrawCanvas();
            }
        });

        document.getElementById('collage-slot-zoom')?.addEventListener('input', (e) => {
            if (activeSlotIndex !== null && state.images[activeSlotIndex]) {
                const z = parseFloat(e.target.value) / 100;
                state.images[activeSlotIndex].zoom = z;
                const val = document.getElementById('collage-slot-zoom-val');
                if (val) val.textContent = `${e.target.value}%`;
                redrawCanvas();
            }
        });

        document.getElementById('collage-slot-reset-btn')?.addEventListener('click', () => {
            if (activeSlotIndex !== null && state.images[activeSlotIndex]) {
                state.images[activeSlotIndex].zoom = 1.0;
                state.images[activeSlotIndex].offsetX = 0;
                state.images[activeSlotIndex].offsetY = 0;
                state.images[activeSlotIndex].fit = 'auto';
                updateSlotSettingsUI();
                redrawCanvas();
            }
        });

        document.getElementById('collage-slot-replace-btn')?.addEventListener('click', () => {
            if (activeSlotIndex !== null) {
                openFilePicker(activeSlotIndex);
            }
        });

        document.getElementById('collage-clear-btn')?.addEventListener('click', clearAll);

        document.getElementById('collage-file-picker')?.addEventListener('change', (e) => {
            if (e.target.files?.[0]) loadFile(e.target.files[0], activeSlotIndex);
        });

        const outer = document.getElementById('collage-canvas-outer');
        if (outer && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                buildSlotOverlay();
                redrawCanvas();
            });
            resizeObserver.observe(outer);
        }

        buildSlotOverlay();
        redrawCanvas();
    });
})();
