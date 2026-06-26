(function () {
    'use strict';

    const {
        toast,
        downloadBlob,
        formatBytes,
        bindDropZone,
        runWhenReady,
        loadPdfJs,
        parsePdfPageRange,
        renderPdfPageCanvas,
        createTesseractWorker,
    } = window.NexusTools;

    const MAX_PDF_BYTES = 15 * 1024 * 1024;
    const OCR_SCALE = 2;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    let pdfFile = null;
    let lastMarkdown = '';
    let ocrWorker = null;
    let ocrWorkerLang = null;

    function defaultOcrLang() {
        return window.__NEXUS_LOCALE === 'ar' ? 'ara' : 'eng';
    }

    function syncOcrLangUi() {
        const mode = document.getElementById('pdf2md-ocr-mode')?.value || 'off';
        const show = mode !== 'off';
        document.getElementById('pdf2md-ocr-lang-wrap')?.classList.toggle('is-hidden', !show);
        document.getElementById('pdf2md-ocr-lang')?.classList.toggle('is-hidden', !show);
    }

    function setPdfFile(file) {
        pdfFile = file || null;
        lastMarkdown = '';
        const info = document.getElementById('pdf2md-info');
        const btn = document.getElementById('pdf2md-convert-btn');
        const preview = document.getElementById('pdf2md-preview');
        const copyBtn = document.getElementById('pdf2md-copy-btn');
        const dlBtn = document.getElementById('pdf2md-download-btn');
        const stats = document.getElementById('pdf2md-stats');
        if (pdfFile) {
            if (info) info.textContent = `${pdfFile.name} · ${formatBytes(pdfFile.size)}`;
            if (btn) btn.disabled = false;
        } else {
            if (info) info.textContent = '';
            if (btn) btn.disabled = true;
        }
        if (preview) {
            preview.value = '';
            preview.classList.add('is-hidden');
        }
        copyBtn?.classList.add('is-hidden');
        dlBtn?.classList.add('is-hidden');
        stats?.classList.add('is-hidden');
        document.getElementById('pdf2md-scan-warn')?.classList.add('is-hidden');
    }

    function setProgress(pct, label) {
        const wrap = document.getElementById('pdf2md-progress-wrap');
        const bar = document.getElementById('pdf2md-progress-bar');
        const lbl = document.getElementById('pdf2md-progress-label');
        const pctEl = document.getElementById('pdf2md-progress-pct');
        if (wrap) wrap.classList.toggle('is-hidden', pct < 0);
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (lbl && label != null) lbl.textContent = label;
        if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    }

    function itemStyle(item) {
        const font = String(item.fontName || '').toLowerCase();
        return {
            bold: /bold|black|heavy|semibold|demi|700|800|900/.test(font),
            italic: /italic|oblique|slanted/.test(font),
            mono: /mono|courier|consolas|code|typewriter/.test(font),
        };
    }

    function applyInlineStyle(text, style) {
        if (!text) return '';
        if (style.mono) return `\`${text}\``;
        if (style.bold && style.italic) return `***${text}***`;
        if (style.bold) return `**${text}**`;
        if (style.italic) return `*${text}*`;
        return text;
    }

    function escapeTableCell(text) {
        return String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    }

    function segmentLine(lineItems) {
        lineItems.sort((a, b) => a.x - b.x);
        const segments = [];
        let current = null;
        for (const item of lineItems) {
            if (!current) {
                current = { text: item.str, style: item.style, endX: item.x + item.w };
                segments.push(current);
                continue;
            }
            const gap = item.x - current.endX;
            const sameStyle =
                current.style.bold === item.style.bold &&
                current.style.italic === item.style.italic &&
                current.style.mono === item.style.mono;
            if (gap > item.fontSize * 0.35 || !sameStyle) {
                current = { text: item.str, style: item.style, endX: item.x + item.w };
                segments.push(current);
            } else {
                current.text += item.str.startsWith(' ') || current.text.endsWith(' ') ? item.str : ` ${item.str}`;
                current.endX = item.x + item.w;
            }
        }
        return segments.map((s) => applyInlineStyle(s.text.replace(/\s+/g, ' ').trim(), s.style)).join('');
    }

    function itemsToRawLines(items) {
        const lines = [];
        let current = [];
        for (const item of items) {
            if (!item.str || !String(item.str).trim()) {
                if (item.hasEOL && current.length) {
                    lines.push(current);
                    current = [];
                }
                continue;
            }
            const t = item.transform || [12, 0, 0, 12, 0, 0];
            current.push({
                str: String(item.str),
                x: t[4],
                y: t[5],
                w: item.width || Math.abs(t[0]) * String(item.str).length * 0.5 || 8,
                fontSize: item.height || Math.max(Math.abs(t[0]), Math.abs(t[3]), 10),
                style: itemStyle(item),
            });
            if (item.hasEOL) {
                lines.push(current);
                current = [];
            }
        }
        if (current.length) lines.push(current);
        return lines;
    }

    function clusterLinesFallback(items) {
        const raw = items
            .filter((item) => item.str && String(item.str).trim())
            .map((item) => {
                const t = item.transform || [12, 0, 0, 12, 0, 0];
                return {
                    str: String(item.str),
                    x: t[4],
                    y: t[5],
                    w: item.width || 8,
                    fontSize: item.height || Math.max(Math.abs(t[0]), Math.abs(t[3]), 10),
                    style: itemStyle(item),
                };
            });
        if (!raw.length) return [];
        raw.sort((a, b) => b.y - a.y || a.x - b.x);
        const heights = raw.map((r) => r.fontSize).sort((a, b) => a - b);
        const medianH = heights[Math.floor(heights.length / 2)] || 12;
        const yTol = Math.max(2, medianH * 0.45);
        const lines = [];
        let current = null;
        for (const item of raw) {
            if (!current || Math.abs(item.y - current.y) > yTol) {
                current = { y: item.y, items: [item] };
                lines.push(current);
            } else {
                current.items.push(item);
                current.y = (current.y * (current.items.length - 1) + item.y) / current.items.length;
            }
        }
        return lines.map((line) => ({
            items: line.items,
            y: line.y,
            medianH,
        }));
    }

    function splitIntoColumns(lineItems, gapThreshold) {
        lineItems.sort((a, b) => a.x - b.x);
        const cols = [];
        let col = [];
        let lastEnd = null;
        for (const item of lineItems) {
            if (lastEnd != null && item.x - lastEnd > gapThreshold) {
                if (col.length) cols.push(col);
                col = [item];
            } else {
                col.push(item);
            }
            lastEnd = item.x + item.w;
        }
        if (col.length) cols.push(col);
        return cols;
    }

    function lineCells(lineItems, gapThreshold) {
        return splitIntoColumns(lineItems, gapThreshold).map((col) => segmentLine(col));
    }

    function detectTableBlock(rawLines, startIdx, gapThreshold) {
        const firstCells = lineCells(rawLines[startIdx], gapThreshold);
        const colCount = firstCells.length;
        if (colCount < 2) return null;

        const rows = [firstCells];
        let idx = startIdx + 1;
        while (idx < rawLines.length) {
            const cells = lineCells(rawLines[idx], gapThreshold);
            if (cells.length !== colCount) break;
            rows.push(cells);
            idx++;
        }
        if (rows.length < 2) return null;
        return { endIdx: idx, rows };
    }

    function tableToMarkdown(rows) {
        const header = rows[0].map(escapeTableCell);
        const sep = header.map(() => '---');
        const body = rows.slice(1).map((row) => row.map(escapeTableCell));
        return [
            `| ${header.join(' | ')} |`,
            `| ${sep.join(' | ')} |`,
            ...body.map((row) => `| ${row.join(' | ')} |`),
        ].join('\n');
    }

    function lineToHeading(text, maxFont, medianH) {
        if (maxFont >= medianH * 2.1 && text.length < 100) return `## ${text}`;
        if (maxFont >= medianH * 1.45 && text.length < 120) return `### ${text}`;
        return null;
    }

    function lineToMarkdownFromItems(lineItems, medianH) {
        const text = segmentLine(lineItems);
        if (!text) return '';
        const bullet = /^([•●◦▪\-–*]|\d+[.)])\s+/.exec(text);
        if (bullet) {
            const body = text.slice(bullet[0].length).trim();
            if (/^\d+[.)]/.test(bullet[1])) return `${bullet[1].replace(/\.$/, '.')} ${body}`;
            return `- ${body}`;
        }
        const maxFont = Math.max(...lineItems.map((i) => i.fontSize));
        const heading = lineToHeading(text.replace(/\*\*|\*|___|_/g, ''), maxFont, medianH);
        if (heading) return heading;
        return text;
    }

    function smartPageToMarkdown(items) {
        const hasEol = items.some((i) => i.hasEOL);
        const rawLines = hasEol ? itemsToRawLines(items) : clusterLinesFallback(items).map((l) => l.items);
        if (!rawLines.length) return '';

        const allSizes = rawLines.flatMap((line) => line.map((i) => i.fontSize)).sort((a, b) => a - b);
        const medianH = allSizes[Math.floor(allSizes.length / 2)] || 12;
        const gapThreshold = medianH * 2.2;

        const parts = [];
        let idx = 0;
        while (idx < rawLines.length) {
            const table = detectTableBlock(rawLines, idx, gapThreshold);
            if (table) {
                parts.push(tableToMarkdown(table.rows));
                idx = table.endIdx;
                continue;
            }
            const lineItems = rawLines[idx];
            const cols = splitIntoColumns(lineItems, gapThreshold);
            if (cols.length >= 2 && cols.every((c) => c.length)) {
                parts.push(cols.map((c) => segmentLine(c)).join('  \n'));
            } else {
                parts.push(lineToMarkdownFromItems(lineItems, medianH));
            }
            idx++;
        }
        return parts.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function simplePageToMarkdown(items) {
        const rawLines = clusterLinesFallback(items);
        if (!rawLines.length) return '';
        const medianH = rawLines[0].medianH || 12;
        return rawLines
            .map((line) => lineToMarkdownFromItems(line.items, medianH))
            .filter(Boolean)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function pageToMarkdown(page, mode) {
        const content = await page.getTextContent();
        const items = content.items || [];
        if (mode === 'simple') return simplePageToMarkdown(items);
        return smartPageToMarkdown(items);
    }

    function ocrTextToMarkdown(text) {
        return String(text || '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .join('\n\n')
            .trim();
    }

    async function ocrPage(page, onProgress, lang) {
        const langKey = lang || defaultOcrLang();
        if (!ocrWorker || ocrWorkerLang !== langKey) {
            if (ocrWorker) {
                try {
                    await ocrWorker.terminate();
                } catch {
                    /* ignore */
                }
                ocrWorker = null;
            }
            setProgress(0, tf('pdf2mdOcrLoading', null, 'Loading OCR engine…'));
            ocrWorker = await createTesseractWorker(langKey, onProgress);
            ocrWorkerLang = langKey;
        }
        const canvas = await renderPdfPageCanvas(page, OCR_SCALE);
        const { data } = await ocrWorker.recognize(canvas);
        canvas.width = 0;
        canvas.height = 0;
        return ocrTextToMarkdown(data.text);
    }

    async function convertPdf() {
        if (!pdfFile) return;
        if (pdfFile.size > MAX_PDF_BYTES) {
            toast(tf('pdf2mdTooLarge', { mb: 15 }, 'PDF must be under 15 MB for conversion.'), 'warn');
            return;
        }

        const btn = document.getElementById('pdf2md-convert-btn');
        const preview = document.getElementById('pdf2md-preview');
        const copyBtn = document.getElementById('pdf2md-copy-btn');
        const dlBtn = document.getElementById('pdf2md-download-btn');
        const statsEl = document.getElementById('pdf2md-stats');
        const includePageHeadings = document.getElementById('pdf2md-page-headings')?.checked !== false;
        const pageSeparators = document.getElementById('pdf2md-page-separators')?.checked !== false;
        const rangeMode = document.getElementById('pdf2md-range-mode')?.value || 'all';
        const rangeSpec = document.getElementById('pdf2md-range')?.value || '';
        const mode = document.getElementById('pdf2md-mode')?.value || 'smart';
        const ocrMode = document.getElementById('pdf2md-ocr-mode')?.value || 'off';
        const ocrLang = document.getElementById('pdf2md-ocr-lang')?.value || defaultOcrLang();

        btn.disabled = true;
        setProgress(0, tf('pdf2mdLoading', null, 'Loading PDF…'));

        try {
            const pdfjs = await loadPdfJs();
            const data = await pdfFile.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data }).promise;
            const pageCount = pdf.numPages;
            const indices =
                rangeMode === 'custom'
                    ? parsePdfPageRange(rangeSpec, pageCount)
                    : [...Array(pageCount)].map((_, i) => i + 1);

            if (!indices.length) {
                toast(tf('pdf2mdNoPages', null, 'No valid pages in that range.'), 'warn');
                return;
            }

            const sections = [];
            let emptyPages = 0;
            let ocrPages = 0;
            let charCount = 0;

            for (let i = 0; i < indices.length; i++) {
                const pageNum = indices[i];
                const basePct = (i / indices.length) * 100;
                setProgress(
                    basePct + 5,
                    tf('pdf2mdConvertingPage', { current: i + 1, total: indices.length }, `Converting page ${i + 1} of ${indices.length}…`)
                );

                const page = await pdf.getPage(pageNum);
                let body = '';
                const ocrProgress = (p) => {
                    setProgress(basePct + 20 + p * (80 / indices.length), null);
                };

                if (ocrMode === 'always') {
                    setProgress(
                        basePct + 10,
                        tf('pdf2mdOcrPage', { current: i + 1, total: indices.length }, `OCR page ${i + 1} of ${indices.length}…`)
                    );
                    try {
                        body = await ocrPage(page, ocrProgress, ocrLang);
                        if (body.trim()) ocrPages++;
                        else body = await pageToMarkdown(page, mode);
                    } catch (ocrErr) {
                        window.NexusTools?.reportError?.(ocrErr, { tool: 'pdf-suite', action: 'pdf-to-md-ocr' });
                        body = await pageToMarkdown(page, mode);
                    }
                } else {
                    body = await pageToMarkdown(page, mode);
                    if (!body.trim() && ocrMode === 'auto') {
                        setProgress(
                            basePct + 20,
                            tf('pdf2mdOcrPage', { current: i + 1, total: indices.length }, `OCR page ${i + 1} of ${indices.length}…`)
                        );
                        try {
                            body = await ocrPage(page, ocrProgress, ocrLang);
                            if (body.trim()) ocrPages++;
                        } catch (ocrErr) {
                            window.NexusTools?.reportError?.(ocrErr, { tool: 'pdf-suite', action: 'pdf-to-md-ocr' });
                        }
                    }
                }

                page.cleanup();

                if (!body.trim()) {
                    emptyPages++;
                    if (includePageHeadings) {
                        sections.push(
                            `## ${tf('pdf2mdPageHeading', { n: pageNum }, `Page ${pageNum}`)}\n\n_${tf('pdf2mdNoText', null, 'No extractable text on this page.')}_`
                        );
                    }
                } else {
                    charCount += body.length;
                    if (includePageHeadings) {
                        sections.push(`## ${tf('pdf2mdPageHeading', { n: pageNum }, `Page ${pageNum}`)}\n\n${body}`);
                    } else {
                        sections.push(body);
                    }
                }
            }

            const separator = pageSeparators ? '\n\n---\n\n' : '\n\n';
            lastMarkdown = sections.join(separator).trim();

            document.getElementById('pdf2md-scan-warn')?.classList.toggle('is-hidden', !!lastMarkdown && emptyPages === 0);

            if (!lastMarkdown) {
                document.getElementById('pdf2md-scan-warn')?.classList.remove('is-hidden');
                toast(
                    ocrMode === 'off'
                        ? tf('pdf2mdScanned', null, 'No text found — enable OCR for scanned PDFs.')
                        : tf('pdf2mdScannedOcr', null, 'No text found even with OCR.'),
                    'warn'
                );
            } else {
                if (emptyPages > 0) {
                    toast(tf('pdf2mdPartial', { n: emptyPages }, `${emptyPages} page(s) had no extractable text.`), 'warn');
                }
                if (statsEl) {
                    const ocrSuffix = ocrPages
                        ? tf('pdf2mdStatsOcrSuffix', { n: ocrPages }, ` · ${ocrPages} OCR`)
                        : '';
                    statsEl.textContent = tf(
                        'pdf2mdStats',
                        { pages: indices.length, chars: charCount.toLocaleString(), ocrSuffix },
                        `${indices.length} pages · ${charCount.toLocaleString()} chars${ocrSuffix}`
                    );
                    statsEl.classList.remove('is-hidden');
                }
            }

            if (preview) {
                preview.value = lastMarkdown;
                preview.classList.toggle('is-hidden', !lastMarkdown);
            }
            copyBtn?.classList.toggle('is-hidden', !lastMarkdown);
            dlBtn?.classList.toggle('is-hidden', !lastMarkdown);

            setProgress(100, tf('pdf2mdDone', null, 'Done'));
            setTimeout(() => setProgress(-1), 800);

            if (lastMarkdown) {
                toast(tf('pdf2mdSuccess', null, 'Markdown ready — copy or download below.'), 'success');
            }
        } catch (err) {
            window.NexusTools?.reportError?.(err, { tool: 'pdf-suite', action: 'pdf-to-md' });
            toast(err.message || tf('pdf2mdFailed', null, 'PDF conversion failed'), 'error');
            setProgress(-1);
        } finally {
            btn.disabled = !pdfFile;
            if (ocrWorker) {
                try {
                    await ocrWorker.terminate();
                } catch {
                    /* ignore */
                }
                ocrWorker = null;
                ocrWorkerLang = null;
            }
        }
    }

    async function copyMarkdown() {
        if (!lastMarkdown) return;
        try {
            await navigator.clipboard.writeText(lastMarkdown);
            toast(tf('pdf2mdCopied', null, 'Markdown copied to clipboard.'), 'success');
        } catch {
            toast(tf('pdf2mdCopyFailed', null, 'Could not copy — select the preview text manually.'), 'warn');
        }
    }

    function downloadMarkdown() {
        if (!lastMarkdown || !pdfFile) return;
        const base = pdfFile.name.replace(/\.pdf$/i, '');
        downloadBlob(new Blob([lastMarkdown], { type: 'text/markdown;charset=utf-8' }), `${base}.md`, 'pdf-suite');
        toast(tf('pdf2mdDownloaded', null, 'Markdown file downloaded.'), 'success');
    }

    runWhenReady(() => {
        bindDropZone(
            document.getElementById('pdf2md-drop'),
            document.getElementById('pdf2md-input'),
            (files) => {
                const pdf = [...files].find((f) => f.type === 'application/pdf');
                if (pdf) setPdfFile(pdf);
                else if (files.length) toast(tf('pdfNeedPdf', null, 'Drop a PDF file.'), 'warn');
            }
        );

        document.getElementById('pdf2md-input')?.addEventListener('change', (e) => {
            if (e.target.files?.[0]) setPdfFile(e.target.files[0]);
            e.target.value = '';
        });

        document.getElementById('pdf2md-range-mode')?.addEventListener('change', (e) => {
            document.getElementById('pdf2md-range-wrap')?.classList.toggle('is-hidden', e.target.value !== 'custom');
        });

        const ocrLangEl = document.getElementById('pdf2md-ocr-lang');
        if (ocrLangEl && !ocrLangEl.dataset.init) {
            ocrLangEl.value = defaultOcrLang();
            ocrLangEl.dataset.init = '1';
        }
        document.getElementById('pdf2md-ocr-mode')?.addEventListener('change', syncOcrLangUi);
        syncOcrLangUi();

        document.getElementById('pdf2md-convert-btn')?.addEventListener('click', convertPdf);
        document.getElementById('pdf2md-copy-btn')?.addEventListener('click', copyMarkdown);
        document.getElementById('pdf2md-download-btn')?.addEventListener('click', downloadMarkdown);
    });
})();
