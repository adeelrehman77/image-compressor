(function () {
    'use strict';

    const { toast, downloadBlob, formatBytes, bindDropZone, runWhenReady, loadJsZip, loadPdfJs } = window.NexusTools;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        if (s) return s;
        if (fallback != null) return fallback;
        return key;
    }

    let pdfFile = null;
    let extractedBlobs = [];

    function parsePageRange(spec, pageCount) {
        const pages = new Set();
        const parts = String(spec || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        for (const part of parts) {
            if (part.includes('-')) {
                const [a, b] = part.split('-').map((n) => parseInt(n.trim(), 10));
                if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
                const lo = Math.min(a, b);
                const hi = Math.max(a, b);
                for (let i = lo; i <= hi; i++) {
                    if (i >= 1 && i <= pageCount) pages.add(i);
                }
            } else {
                const n = parseInt(part, 10);
                if (n >= 1 && n <= pageCount) pages.add(n);
            }
        }
        return [...pages].sort((a, b) => a - b);
    }

    function setPdfFile(file) {
        pdfFile = file || null;
        extractedBlobs = [];
        const info = document.getElementById('pdf2img-info');
        const btn = document.getElementById('pdf2img-extract-btn');
        const compressBtn = document.getElementById('pdf2img-compress-btn');
        const thumbs = document.getElementById('pdf2img-thumbs');
        if (pdfFile) {
            if (info) info.textContent = `${pdfFile.name} · ${formatBytes(pdfFile.size)}`;
            if (btn) btn.disabled = false;
        } else {
            if (info) info.textContent = '';
            if (btn) btn.disabled = true;
        }
        if (compressBtn) compressBtn.classList.add('is-hidden');
        if (thumbs) {
            thumbs.innerHTML = '';
            thumbs.classList.add('is-hidden');
        }
    }

    function setProgress(pct, label) {
        const wrap = document.getElementById('pdf2img-progress-wrap');
        const bar = document.getElementById('pdf2img-progress-bar');
        const lbl = document.getElementById('pdf2img-progress-label');
        const pctEl = document.getElementById('pdf2img-progress-pct');
        if (wrap) wrap.classList.toggle('is-hidden', pct < 0);
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (lbl && label != null) lbl.textContent = label;
        if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    }

    async function renderPage(pdf, pageNum, scale, mime, quality) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();
        if (canvas.convertToBlob) {
            const opts = { type: mime };
            if (mime === 'image/jpeg') opts.quality = quality;
            return canvas.convertToBlob(opts);
        }
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('Render failed'))),
                mime,
                mime === 'image/jpeg' ? quality : undefined
            );
        });
    }

    function renderThumbs(blobs) {
        const grid = document.getElementById('pdf2img-thumbs');
        if (!grid) return;
        grid.innerHTML = '';
        blobs.forEach(({ blob, page }) => {
            const fig = document.createElement('figure');
            fig.className = 'pdf2img-thumb';
            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            img.alt = `Page ${page}`;
            img.decoding = 'async';
            const cap = document.createElement('figcaption');
            cap.textContent = `${tf('pdf2imgPage', { n: page }, `Page ${page}`)} · ${formatBytes(blob.size)}`;
            fig.appendChild(img);
            fig.appendChild(cap);
            grid.appendChild(fig);
        });
        grid.classList.remove('is-hidden');
    }

    async function extractPages() {
        if (!pdfFile) return;
        const btn = document.getElementById('pdf2img-extract-btn');
        const compressBtn = document.getElementById('pdf2img-compress-btn');
        const mime = document.getElementById('pdf2img-format')?.value || 'image/jpeg';
        const quality = 0.9;
        const rangeMode = document.getElementById('pdf2img-range-mode')?.value || 'all';
        const rangeSpec = document.getElementById('pdf2img-range')?.value || '';

        btn.disabled = true;
        extractedBlobs = [];
        setProgress(0, tf('pdf2imgLoading', null, 'Loading PDF…'));

        try {
            const pdfjs = await loadPdfJs();
            const data = await pdfFile.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data }).promise;
            const pageCount = pdf.numPages;
            let indices = rangeMode === 'custom'
                ? parsePageRange(rangeSpec, pageCount)
                : [...Array(pageCount)].map((_, i) => i + 1);

            if (!indices.length) {
                toast(tf('pdf2imgNoPages', null, 'No valid pages in that range.'), 'warn');
                return;
            }

            const base = pdfFile.name.replace(/\.pdf$/i, '');
            const ext = mime === 'image/png' ? 'png' : 'jpg';
            const scale = 2.0;
            const blobs = [];

            for (let i = 0; i < indices.length; i++) {
                const page = indices[i];
                setProgress(
                    ((i + 0.5) / indices.length) * 100,
                    tf('pdf2imgExtractingPage', { current: i + 1, total: indices.length }, `Extracting page ${i + 1} of ${indices.length}…`)
                );
                const blob = await renderPage(pdf, page, scale, mime, quality);
                blobs.push({ blob, page, name: `${base}-page-${page}.${ext}` });
            }

            extractedBlobs = blobs;
            renderThumbs(blobs);
            setProgress(100, tf('pdf2imgDone', null, 'Done'));
            setTimeout(() => setProgress(-1), 800);

            if (blobs.length === 1) {
                downloadBlob(blobs[0].blob, blobs[0].name, 'pdf-suite');
                toast(tf('pdf2imgSingleDone', null, 'Image downloaded.'), 'success');
            } else {
                await loadJsZip();
                const zip = new JSZip();
                blobs.forEach(({ blob, name }) => zip.file(name, blob));
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                downloadBlob(zipBlob, `${base}-pages.zip`, 'pdf-suite');
                toast(tf('pdf2imgZipDone', { n: blobs.length }, `${blobs.length} pages in ZIP.`), 'success');
            }

            if (compressBtn) compressBtn.classList.remove('is-hidden');
        } catch (err) {
            NexusTools.reportError(err, { tool: 'pdf-suite', action: 'pdf-to-images' });
            toast(err.message || tf('pdf2imgFailed', null, 'PDF extraction failed'), 'error');
            setProgress(-1);
        } finally {
            btn.disabled = !pdfFile;
        }
    }

    async function sendToCompressor() {
        if (!extractedBlobs.length) return;
        const files = extractedBlobs.map(
            ({ blob, name }) => new File([blob], name, { type: blob.type })
        );
        if (window.__NEXUS_NAVIGATE_TOOL) await window.__NEXUS_NAVIGATE_TOOL('compress');
        window.__NEXUS_COMPRESS_ADD_FILES?.(files);
        toast(tf('pdf2imgSentCompress', { n: files.length }, `${files.length} image(s) added to compressor.`), 'success');
    }

    runWhenReady(() => {
        const input = document.getElementById('pdf2img-input');
        bindDropZone(
            document.getElementById('pdf2img-drop'),
            input,
            (files) => {
                const pdf = [...files].find((f) => f.type === 'application/pdf');
                if (pdf) setPdfFile(pdf);
                else if (files.length) toast(tf('pdfNeedPdf', null, 'Drop a PDF file.'), 'warn');
            }
        );
        input?.addEventListener('change', () => {
            if (input.files?.[0]) setPdfFile(input.files[0]);
            input.value = '';
        });

        document.getElementById('pdf2img-range-mode')?.addEventListener('change', (e) => {
            document.getElementById('pdf2img-range-wrap')?.classList.toggle('is-hidden', e.target.value !== 'custom');
        });

        document.getElementById('pdf2img-extract-btn')?.addEventListener('click', extractPages);
        document.getElementById('pdf2img-compress-btn')?.addEventListener('click', sendToCompressor);
    });
})();
