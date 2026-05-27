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
            '2.2.5'
        );
    }

    function assetPrefix() {
        if (window.__NEXUS_ASSET_PREFIX != null) return window.__NEXUS_ASSET_PREFIX;
        var path = location.pathname || '/';
        if (path === '/ar' || path === '/ar/' || path.indexOf('/ar/') === 0) return '../';
        return '';
    }

    function resolveAsset(src) {
        if (!src || /^(https?:|\/)/.test(src)) return src;
        return `${assetPrefix()}${src.replace(/^\.\//, '')}`;
    }

    function assetUrl(src) {
        const resolved = resolveAsset(src);
        if (!resolved || resolved.includes('?')) return resolved;
        return `${resolved}?v=${appVersion()}`;
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
        'passport-studio': 'js/passport-studio.js',
        'images-to-pdf': 'js/tools/images-to-pdf.js',
        'pdf-suite': ['js/tools/pdf-suite.js', 'js/tools/pdf-to-images.js'],
        svg: 'js/tools/svg-optimizer.js',
        'heic-converter': 'js/tools/heic-converter.js',
        'format-converter': 'js/tools/format-converter.js',
        'image-cropper': 'js/tools/image-cropper.js',
        'photo-checker': 'js/tools/photo-checker.js',
        redactor: 'js/tools/document-redactor.js',
    };
    let exifViewerPromise = null;
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

    function loadExternalScript(src) {
        const key = `ext:${src}`;
        if (scriptPromises[key]) return scriptPromises[key];
        scriptPromises[key] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.body.appendChild(s);
        });
        return scriptPromises[key];
    }

    function loadExternalStylesheet(href) {
        if (document.querySelector(`link[data-nexus-href="${href}"]`)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.nexusHref = href;
            link.onload = () => resolve();
            link.onerror = () => reject(new Error(`Failed to load ${href}`));
            document.head.appendChild(link);
        });
    }

    let cropperPromise = null;

    async function ensureCropper() {
        if (typeof Cropper !== 'undefined') return;
        if (!cropperPromise) {
            cropperPromise = (async () => {
                await loadExternalStylesheet(
                    'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css'
                );
                await loadExternalScript(
                    'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js'
                );
            })();
        }
        await cropperPromise;
    }

    let pdfJsPromise = null;

    function loadPdfJs() {
        if (pdfJsPromise) return pdfJsPromise;
        pdfJsPromise = (async () => {
            const pdfjs = await import(
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs'
            );
            pdfjs.GlobalWorkerOptions.workerSrc =
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
            return pdfjs;
        })();
        return pdfJsPromise;
    }

    async function ensureTool(toolId) {
        const entry = TOOL_SCRIPTS[toolId];
        if (!entry || loadedTools.has(toolId)) return;
        const sources = Array.isArray(entry) ? entry : [entry];
        for (const src of sources) {
            await loadScript(src);
        }
        loadedTools.add(toolId);
    }

    async function ensureExifViewer() {
        if (window.NexusExif?.showExif) return;
        if (!exifViewerPromise) {
            exifViewerPromise = loadScript('js/exif-viewer.js');
        }
        await exifViewerPromise;
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

    const MOBILE_SETTINGS_MQ = window.matchMedia('(max-width: 780px)');

    function setSettingsCardExpanded(card, expanded) {
        const btn = card.querySelector('[data-settings-toggle]');
        const body = card.querySelector('.settings-card__body');
        if (!btn || !body) return;
        btn.setAttribute('aria-expanded', String(expanded));
        body.classList.toggle('is-collapsed', !expanded);
        btn.querySelector('.settings-chevron')?.classList.toggle('is-open', expanded);
    }

    function expandSettingsCard(target) {
        const card = typeof target === 'string'
            ? (document.getElementById(target)?.closest('[data-settings-card]') || document.getElementById(target))
            : (target?.closest?.('[data-settings-card]') || target);
        if (!card) return;
        setSettingsCardExpanded(card, true);
    }

    function applySettingsCardDefaults() {
        const mobile = MOBILE_SETTINGS_MQ.matches;
        document.querySelectorAll('[data-settings-card]').forEach((card) => {
            const btn = card.querySelector('[data-settings-toggle]');
            if (!btn) return;
            let expanded;
            if (card.hasAttribute('data-default-collapsed-mobile')) {
                expanded = !mobile;
            } else if (card.hasAttribute('data-default-open')) {
                expanded = true;
            } else {
                expanded = btn.getAttribute('aria-expanded') === 'true';
            }
            setSettingsCardExpanded(card, expanded);
        });
    }

    function initSettingsCards() {
        applySettingsCardDefaults();
        MOBILE_SETTINGS_MQ.addEventListener('change', applySettingsCardDefaults);

        document.querySelectorAll('[data-settings-toggle]').forEach((btn) => {
            if (btn.dataset.settingsBound === '1') return;
            btn.dataset.settingsBound = '1';
            btn.addEventListener('click', () => {
                const card = btn.closest('[data-settings-card]');
                if (!card) return;
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                setSettingsCardExpanded(card, !expanded);
            });
        });
    }

    runWhenReady(initSettingsCards);

    return {
        toast,
        formatBytes,
        trackDownload,
        downloadBlob,
        appVersion,
        assetUrl,
        resolveAsset,
        assetPrefix,
        requirePdfLib,
        loadPdfLib,
        loadJsZip,
        loadScript,
        runWhenReady,
        ensureTool,
        ensureExifViewer,
        reportError,
        bindDropZone,
        initSettingsCards,
        expandSettingsCard,
        ensureCropper,
        loadPdfJs,
        loadExternalScript,
        loadExternalStylesheet,
    };
})();
