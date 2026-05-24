(function () {
    const { toast, downloadBlob, requirePdfLib } = window.NexusTools;
    const files = [];

    function renderList() {
        const list = document.getElementById('itp-list');
        const btn = document.getElementById('itp-build');
        if (!list) return;
        list.innerHTML = '';
        files.forEach((file, i) => {
            const li = document.createElement('li');
            li.className = 'tool-file-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tool-file-name';
            nameSpan.textContent = file.name;

            const actions = document.createElement('span');
            actions.className = 'tool-file-actions';
            actions.innerHTML = `
                <button type="button" class="btn-ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-ghost" data-down="${i}" ${i === files.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-ghost" data-rm="${i}">Remove</button>`;

            li.appendChild(nameSpan);
            li.appendChild(actions);
            list.appendChild(li);
        });
        if (btn) btn.disabled = files.length === 0;
    }

    function addFiles(fileList) {
        let added = 0;
        for (const f of fileList) {
            if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) continue;
            files.push(f);
            added++;
        }
        if (fileList.length && !added) toast('Add JPEG, PNG, or WebP images.', 'warn');
        renderList();
    }

    async function embedImage(pdfDoc, file) {
        let bytes;
        let mime = file.type;

        if (mime === 'image/jpeg' || mime === 'image/png') {
            bytes = await file.arrayBuffer();
        } else {
            const bitmap = await createImageBitmap(file);
            try {
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0);
                const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
                bytes = await blob.arrayBuffer();
                mime = 'image/jpeg';
            } finally {
                bitmap.close();
            }
        }

        if (mime === 'image/png') {
            try {
                return await pdfDoc.embedPng(bytes);
            } catch {
                /* fall through to JPEG embed */
            }
        }
        return await pdfDoc.embedJpg(bytes);
    }

    async function buildPdf() {
        if (!files.length) return;
        const btn = document.getElementById('itp-build');
        btn.disabled = true;
        btn.textContent = 'Building PDF…';
        try {
            const PDFLib = await requirePdfLib();
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();
            const pageSize = document.getElementById('itp-page-size')?.value || 'a4';
            const A4 = [595.28, 841.89];

            for (const file of files) {
                const image = await embedImage(pdfDoc, file);
                if (pageSize === 'fit') {
                    const dims = image.scale(1);
                    const page = pdfDoc.addPage([dims.width, dims.height]);
                    page.drawImage(image, { x: 0, y: 0, width: dims.width, height: dims.height });
                } else {
                    const page = pdfDoc.addPage(A4);
                    const margin = 36;
                    const fit = image.scaleToFit(page.getWidth() - margin * 2, page.getHeight() - margin * 2);
                    page.drawImage(image, {
                        x: (page.getWidth() - fit.width) / 2,
                        y: (page.getHeight() - fit.height) / 2,
                        width: fit.width,
                        height: fit.height,
                    });
                }
            }

            const out = await pdfDoc.save();
            downloadBlob(new Blob([out], { type: 'application/pdf' }), 'combined-documents.pdf', 'images-to-pdf');
            toast('PDF ready.', 'success');
        } catch (err) {
            NexusTools.reportError(err, { tool: 'images-to-pdf' });
            toast(err.message || 'PDF build failed', 'error');
        } finally {
            btn.disabled = files.length === 0;
            btn.textContent = 'Download PDF';
        }
    }

    window.NexusTools.runWhenReady(() => {
        const input = document.getElementById('itp-input');
        input?.addEventListener('change', (e) => {
            addFiles(e.target.files || []);
            e.target.value = '';
        });
        window.NexusTools.bindDropZone?.(
            document.getElementById('itp-drop'),
            input,
            (files) => addFiles(files)
        );
        document.getElementById('itp-list')?.addEventListener('click', (e) => {
            const up = e.target.dataset.up;
            const down = e.target.dataset.down;
            const rm = e.target.dataset.rm;
            if (up !== undefined) {
                const i = Number(up);
                [files[i - 1], files[i]] = [files[i], files[i - 1]];
                renderList();
            }
            if (down !== undefined) {
                const i = Number(down);
                [files[i + 1], files[i]] = [files[i], files[i + 1]];
                renderList();
            }
            if (rm !== undefined) {
                files.splice(Number(rm), 1);
                renderList();
            }
        });
        document.getElementById('itp-build')?.addEventListener('click', buildPdf);
    });
})();
