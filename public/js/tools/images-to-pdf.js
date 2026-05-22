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
            li.innerHTML = `
                <span class="tool-file-name">${file.name}</span>
                <span class="tool-file-actions">
                    <button type="button" class="btn-ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="btn-ghost" data-down="${i}" ${i === files.length - 1 ? 'disabled' : ''}>↓</button>
                    <button type="button" class="btn-ghost" data-rm="${i}">Remove</button>
                </span>`;
            list.appendChild(li);
        });
        if (btn) btn.disabled = files.length === 0;
    }

    function addFiles(fileList) {
        for (const f of fileList) {
            if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) continue;
            files.push(f);
        }
        renderList();
    }

    async function embedImage(pdfDoc, bytes, mime) {
        if (mime === 'image/png' || mime === 'image/webp') {
            try {
                return await pdfDoc.embedPng(bytes);
            } catch {
                return await pdfDoc.embedJpg(bytes);
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
                const bytes = await file.arrayBuffer();
                const image = await embedImage(pdfDoc, bytes, file.type);
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
            downloadBlob(new Blob([out], { type: 'application/pdf' }), 'combined-documents.pdf');
            toast('PDF ready.', 'success');
        } catch (err) {
            toast(err.message || 'PDF build failed', 'error');
        } finally {
            btn.disabled = files.length === 0;
            btn.textContent = 'Download PDF';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('itp-input')?.addEventListener('change', (e) => {
            addFiles(e.target.files || []);
            e.target.value = '';
        });
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
