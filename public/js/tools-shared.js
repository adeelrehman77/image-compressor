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

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    let pdfLibPromise = null;

    function loadPdfLib() {
        if (typeof PDFLib !== 'undefined') return Promise.resolve(PDFLib);
        if (pdfLibPromise) return pdfLibPromise;
        pdfLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'vendor/pdf-lib.min.js';
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

    return { toast, formatBytes, downloadBlob, requirePdfLib, loadPdfLib };
})();
