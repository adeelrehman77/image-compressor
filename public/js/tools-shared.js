window.NexusTools = (function () {
    function toast(message, type = 'info') {
        const root = document.getElementById('toast-root');
        if (!root) return;
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.setAttribute('role', 'alert');
        el.textContent = message;
        root.appendChild(el);
        setTimeout(() => el.classList.add('toast-out'), 3200);
        setTimeout(() => el.remove(), 3800);
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    function appVersion() {
        return (
            document.documentElement.dataset.appVersion ||
            document.getElementById('app-version')?.textContent?.match(/v([\d.]+)/)?.[1] ||
            '2.1.0'
        );
    }

    function assetUrl(src) {
        if (!src || src.includes('?')) return src;
        return `${src}?v=${appVersion()}`;
    }

    function trackDownload(filename, toolName = 'unknown') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: 'tool_conversion',
            event_category: 'engagement',
            event_label: 'file_downloaded',
            file_name: filename,
            tool_name: toolName,
        });
    }

    function downloadBlob(blob, filename, toolName = 'unknown') {
        trackDownload(filename, toolName);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    const TOOL_SCRIPTS = {
        'images-to-pdf': 'js/tools/images-to-pdf.js',
        'pdf-suite': 'js/tools/pdf-suite.js',
        svg: 'js/tools/svg-optimizer.js',
    };
    const loadedTools = new Set();
    const scriptPromises = {};

    function runWhenReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    function loadScript(src) {
        if (scriptPromises[src]) return scriptPromises[src];
        const existing = document.querySelector(`script[data-nexus-src="${src}"]`);
        if (existing?.dataset.ready === '1') return Promise.resolve();

        scriptPromises[src] = new Promise((resolve, reject) => {
            const done = () => resolve();
            const fail = () => reject(new Error(`Failed to load ${src}`));
            if (existing) {
                existing.addEventListener('load', done, { once: true });
                existing.addEventListener('error', fail, { once: true });
                return;
            }
            const s = document.createElement('script');
            s.src = assetUrl(src);
            s.dataset.nexusSrc = src;
            s.onload = () => {
                s.dataset.ready = '1';
                resolve();
            };
            s.onerror = fail;
            document.body.appendChild(s);
        });
        return scriptPromises[src];
    }

    async function ensureTool(toolId) {
        const src = TOOL_SCRIPTS[toolId];
        if (!src || loadedTools.has(toolId)) return;
        await loadScript(src);
        loadedTools.add(toolId);
    }

    let jsZipPromise = null;

    function loadJsZip() {
        if (typeof JSZip !== 'undefined') return Promise.resolve(JSZip);
        if (jsZipPromise) return jsZipPromise;
        jsZipPromise = loadScript('vendor/jszip.min.js').then(() => JSZip);
        return jsZipPromise;
    }

    let pdfLibPromise = null;

    function loadPdfLib() {
        if (typeof PDFLib !== 'undefined') return Promise.resolve(PDFLib);
        if (pdfLibPromise) return pdfLibPromise;
        pdfLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = assetUrl('vendor/pdf-lib.min.js');
            s.async = true;
            s.onload = () => resolve(window.PDFLib);
            s.onerror = () => reject(new Error('Could not load PDF library'));
            document.head.appendChild(s);
        });
        return pdfLibPromise;
    }

    async function requirePdfLib() {
        return loadPdfLib();
    }

    function reportError(err, context) {
        window.NexusSentry?.captureException(err, context);
    }

    function bindDropZone(dropZone, fileInput, onFiles) {
        if (!dropZone || typeof onFiles !== 'function') return;

        const prevent = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        let dragDepth = 0;

        const setDragActive = (active) => {
            dropZone.classList.toggle('drag-active', active);
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => {
            dropZone.addEventListener(ev, prevent);
        });

        dropZone.addEventListener('dragenter', () => {
            dragDepth += 1;
            setDragActive(true);
        });
        dropZone.addEventListener('dragover', () => setDragActive(true));
        dropZone.addEventListener('dragleave', () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) setDragActive(false);
        });
        dropZone.addEventListener('drop', (e) => {
            dragDepth = 0;
            setDragActive(false);
            const files = e.dataTransfer?.files;
            if (files?.length) onFiles(files);
        });

        if (fileInput) {
            dropZone.addEventListener('click', (e) => {
                if (e.target.closest('label, button, a, input')) return;
                fileInput.click();
            });
            dropZone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInput.click();
                }
            });
        }
    }

    return {
        toast,
        formatBytes,
        trackDownload,
        downloadBlob,
        appVersion,
        assetUrl,
        requirePdfLib,
        loadPdfLib,
        loadJsZip,
        loadScript,
        runWhenReady,
        ensureTool,
        reportError,
        bindDropZone,
    };
})();
