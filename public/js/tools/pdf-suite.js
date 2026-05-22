(function () {
    const { toast, downloadBlob, requirePdfLib } = window.NexusTools;
    const mergeFiles = [];
    let splitFile = null;

    function renderMergeList() {
        const list = document.getElementById('pdf-merge-list');
        const btn = document.getElementById('pdf-merge-btn');
        if (!list) return;
        list.innerHTML = '';
        mergeFiles.forEach((file, i) => {
            const li = document.createElement('li');
            li.className = 'tool-file-item';
            li.innerHTML = `<span class="tool-file-name">${file.name}</span>
                <button type="button" class="btn-ghost" data-rm="${i}">Remove</button>`;
            list.appendChild(li);
        });
        if (btn) btn.disabled = mergeFiles.length < 2;
    }

    async function mergePdfs() {
        const btn = document.getElementById('pdf-merge-btn');
        btn.disabled = true;
        btn.textContent = 'Merging…';
        try {
            const PDFLib = await requirePdfLib();
            const { PDFDocument } = PDFLib;
            const merged = await PDFDocument.create();
            for (const file of mergeFiles) {
                const src = await PDFDocument.load(await file.arrayBuffer());
                const pages = await merged.copyPages(src, src.getPageIndices());
                pages.forEach((p) => merged.addPage(p));
            }
            const bytes = await merged.save();
            downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
            toast('Merged PDF downloaded.', 'success');
        } catch (err) {
            NexusTools.reportError(err, { tool: 'pdf-suite', action: 'merge' });
            toast(err.message || 'Merge failed', 'error');
        } finally {
            btn.textContent = 'Download merged PDF';
            renderMergeList();
        }
    }

    async function splitPdf() {
        if (!splitFile) return;
        const btn = document.getElementById('pdf-split-btn');
        const info = document.getElementById('pdf-split-info');
        btn.disabled = true;
        btn.textContent = 'Working…';
        try {
            const PDFLib = await requirePdfLib();
            const { PDFDocument } = PDFLib;
            const src = await PDFDocument.load(await splitFile.arrayBuffer());
            const count = src.getPageCount();
            info.textContent = `${count} page(s) found`;

            if (count === 1) {
                const out = await PDFDocument.create();
                const [page] = await out.copyPages(src, [0]);
                out.addPage(page);
                const bytes = await out.save();
                downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'page-1.pdf');
                toast('Page downloaded.', 'success');
                return;
            }

            await window.NexusTools.loadJsZip();
            const zip = new JSZip();
            for (let i = 0; i < count; i++) {
                const out = await PDFDocument.create();
                const [page] = await out.copyPages(src, [i]);
                out.addPage(page);
                const bytes = await out.save();
                zip.file(`page-${i + 1}.pdf`, bytes);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, 'pdf-pages.zip');
            toast(`${count} pages in ZIP.`, 'success');
        } catch (err) {
            NexusTools.reportError(err, { tool: 'pdf-suite', action: 'split' });
            toast(err.message || 'Split failed', 'error');
        } finally {
            btn.textContent = 'Download pages';
            btn.disabled = !splitFile;
        }
    }

    window.NexusTools.runWhenReady(() => {
        document.querySelectorAll('.pdf-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.pdf-tab').forEach((t) => {
                    t.classList.toggle('active', t === tab);
                    t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                });
                const id = tab.dataset.pdfTab;
                document.getElementById('pdf-panel-merge')?.classList.toggle('is-hidden', id !== 'merge');
                document.getElementById('pdf-panel-split')?.classList.toggle('is-hidden', id !== 'split');
            });
        });

        document.getElementById('pdf-merge-input')?.addEventListener('change', (e) => {
            for (const f of e.target.files || []) {
                if (f.type === 'application/pdf') mergeFiles.push(f);
            }
            e.target.value = '';
            renderMergeList();
        });

        document.getElementById('pdf-merge-list')?.addEventListener('click', (e) => {
            if (e.target.dataset.rm !== undefined) {
                mergeFiles.splice(Number(e.target.dataset.rm), 1);
                renderMergeList();
            }
        });

        document.getElementById('pdf-merge-btn')?.addEventListener('click', mergePdfs);

        document.getElementById('pdf-split-input')?.addEventListener('change', (e) => {
            splitFile = e.target.files?.[0] || null;
            const btn = document.getElementById('pdf-split-btn');
            const info = document.getElementById('pdf-split-info');
            if (splitFile) {
                info.textContent = splitFile.name;
                btn.disabled = false;
            } else {
                info.textContent = '';
                btn.disabled = true;
            }
        });

        document.getElementById('pdf-split-btn')?.addEventListener('click', splitPdf);
    });
})();
