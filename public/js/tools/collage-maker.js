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

    function drawFit(c, img, x, y, w, h, fit) {
        if (fit === 'cover') {
            const scale = Math.max(w / img.width, h / img.height);
            const sw = img.width * scale;
            const sh = img.height * scale;
            c.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
        } else {
            const scale = Math.min(w / img.width, h / img.height);
            const sw = img.width * scale;
            const sh = img.height * scale;
            c.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
        }
    }

    function setStatus(msg, type) {
        const el = document.getElementById('collage-status-msg');
        if (!el) return;
        el.textContent = msg;
        el.classList.toggle('is-ok', type === 'ok');
        el.classList.toggle('is-err', type === 'err');
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
            div.className = 'collage-slot' + (state.images[i] ? ' is-filled' : ' is-empty');
            div.dataset.index = String(i);
            div.style.left = `${((s.x / W) * 100).toFixed(3)}%`;
            div.style.top = `${((s.y / H) * 100).toFixed(3)}%`;
            div.style.width = `${((s.w / W) * 100).toFixed(3)}%`;
            div.style.height = `${((s.h / H) * 100).toFixed(3)}%`;

            if (!state.images[i]) {
                const icon = document.createElement('span');
                icon.className = 'collage-slot-icon';
                icon.textContent = '+';
                icon.setAttribute('aria-hidden', 'true');
                div.appendChild(icon);
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
            }

            div.addEventListener('click', () => openFilePicker(i));
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

    function loadFile(file, slotIndex) {
        if (!file || !file.type.startsWith('image/')) {
            toast(tf('collageNeedImage', null, 'Please use an image file.'), 'warn');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                state.images[slotIndex] = img;
                buildSlotOverlay();
                redrawCanvas();
                setStatus(tf('collagePhotoLoaded', { n: slotIndex + 1 }, `Photo ${slotIndex + 1} loaded.`), 'ok');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removeSlot(i) {
        delete state.images[i];
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
        const fit = document.getElementById('collage-fit-select')?.value || 'cover';

        slots.forEach((s, i) => {
            ctx.save();
            if (state.radius > 0) {
                roundRect(ctx, s.x, s.y, s.w, s.h, state.radius);
                ctx.clip();
            }
            if (state.images[i]) {
                drawFit(ctx, state.images[i], s.x, s.y, s.w, s.h, fit);
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.06)';
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }
            ctx.restore();
        });
    }

    function setLayout(name, btn) {
        state.layout = name;
        document.querySelectorAll('.collage-layout-btn').forEach((b) => b.classList.remove('is-active'));
        btn?.classList.add('is-active');
        state.images = {};
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
