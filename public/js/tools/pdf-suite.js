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
            const nameSpan = document.createElement('span');
            nameSpan.className = 'tool-file-name';
            nameSpan.textContent = file.name;
            const actions = document.createElement('span');
            actions.className = 'tool-file-actions';
            actions.innerHTML = `
                <button type="button" class="btn-ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-ghost" data-down="${i}" ${i === mergeFiles.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-ghost" data-rm="${i}">Remove</button>`;
            li.appendChild(nameSpan);
            li.appendChild(actions);
            list.appendChild(li);
        });
        if (btn) btn.disabled = mergeFiles.length < 2;
        document.getElementById('pdf-merge-empty')?.classList.toggle('is-hidden', mergeFiles.length > 0);
    }

    function addMergeFiles(fileList) {
        let added = 0;
        for (const f of fileList) {
            if (f.type === 'application/pdf') {
                mergeFiles.push(f);
                added++;
            }
        }
        if (fileList.length && !added) toast('Drop PDF files only.', 'warn');
        renderMergeList();
    }

    function setSplitFile(file) {
        splitFile = file || null;
        const btn = document.getElementById('pdf-split-btn');
        const info = document.getElementById('pdf-split-info');
        if (splitFile) {
            info.textContent = splitFile.name;
            btn.disabled = false;
        } else {
            info.textContent = '';
            btn.disabled = true;
        }
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
            downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf', 'pdf-suite');
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
                downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'page-1.pdf', 'pdf-suite');
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
            downloadBlob(zipBlob, 'pdf-pages.zip', 'pdf-suite');
            toast(`${count} pages in ZIP.`, 'success');
        } catch (err) {
            NexusTools.reportError(err, { tool: 'pdf-suite', action: 'split' });
            toast(err.message || 'Split failed', 'error');
        } finally {
            btn.textContent = 'Download pages';
            btn.disabled = !splitFile;
        }
    }

    const VALID_PDF_TABS = { merge: 1, split: 1, 'to-images': 1, 'to-md': 1 };

    function activatePdfTab(id) {
        const tabId = VALID_PDF_TABS[id] ? id : 'merge';
        document.querySelectorAll('.pdf-tab').forEach((t) => {
            const active = t.dataset.pdfTab === tabId;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.getElementById('pdf-panel-merge')?.classList.toggle('is-hidden', tabId !== 'merge');
        document.getElementById('pdf-panel-split')?.classList.toggle('is-hidden', tabId !== 'split');
        document.getElementById('pdf-panel-to-images')?.classList.toggle('is-hidden', tabId !== 'to-images');
        document.getElementById('pdf-panel-to-md')?.classList.toggle('is-hidden', tabId !== 'to-md');
        document.getElementById('pdf-sidebar-merge')?.classList.toggle('is-hidden', tabId !== 'merge');
        document.getElementById('pdf-sidebar-split')?.classList.toggle('is-hidden', tabId !== 'split');
        document.getElementById('pdf-sidebar-to-images')?.classList.toggle('is-hidden', tabId !== 'to-images');
        document.getElementById('pdf-sidebar-to-md')?.classList.toggle('is-hidden', tabId !== 'to-md');
        document.getElementById('pdf-merge-empty')?.classList.toggle('is-hidden', tabId !== 'merge');
    }

    window.__NEXUS_PDF_SUITE_ACTIVATE = activatePdfTab;

    window.NexusTools.runWhenReady(() => {
        document.querySelectorAll('.pdf-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                const id = tab.dataset.pdfTab;
                activatePdfTab(id);
                window.NexusTools.syncPdfSuiteHash?.(id);
            });
        });

        document.getElementById('pdf-merge-input')?.addEventListener('change', (e) => {
            addMergeFiles(e.target.files || []);
            e.target.value = '';
        });

        window.NexusTools.bindDropZone?.(
            document.getElementById('pdf-merge-drop'),
            document.getElementById('pdf-merge-input'),
            (files) => addMergeFiles(files)
        );

        document.getElementById('pdf-merge-list')?.addEventListener('click', (e) => {
            const up = e.target.dataset.up;
            const down = e.target.dataset.down;
            const rm = e.target.dataset.rm;
            if (up !== undefined) {
                const i = Number(up);
                [mergeFiles[i - 1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i - 1]];
                renderMergeList();
            }
            if (down !== undefined) {
                const i = Number(down);
                [mergeFiles[i + 1], mergeFiles[i]] = [mergeFiles[i], mergeFiles[i + 1]];
                renderMergeList();
            }
            if (rm !== undefined) {
                mergeFiles.splice(Number(rm), 1);
                renderMergeList();
            }
        });

        document.getElementById('pdf-merge-btn')?.addEventListener('click', mergePdfs);

        document.getElementById('pdf-split-input')?.addEventListener('change', (e) => {
            setSplitFile(e.target.files?.[0] || null);
            e.target.value = '';
        });

        window.NexusTools.bindDropZone?.(
            document.getElementById('pdf-split-drop'),
            document.getElementById('pdf-split-input'),
            (files) => {
                const pdf = [...files].find((f) => f.type === 'application/pdf');
                if (pdf) setSplitFile(pdf);
                else if (files.length) toast('Drop a PDF file.', 'warn');
            }
        );

        document.getElementById('pdf-split-btn')?.addEventListener('click', splitPdf);
    });
})();
