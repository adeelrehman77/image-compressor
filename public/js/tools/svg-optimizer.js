(function () {
    const { toast, formatBytes, downloadBlob, bindDropZone } = window.NexusTools;

    function optimizeSvg(source) {
        let s = source.trim();
        s = s.replace(/<\?xml[\s\S]*?\?>/gi, '');
        s = s.replace(/<!--[\s\S]*?-->/g, '');
        s = s.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
        s = s.replace(/<title[\s\S]*?<\/title>/gi, '');
        s = s.replace(/<desc[\s\S]*?<\/desc>/gi, '');
        s = s.replace(/\sxmlns:(?:sketch|xlink|dc|cc|sodipodi|inkscape)="[^"]*"/gi, '');
        s = s.replace(/\s(?:sketch|sodipodi|inkscape):[a-zA-Z0-9_-]+="[^"]*"/g, '');
        s = s.replace(/\s+/g, ' ');
        s = s.replace(/>\s+</g, '><');
        s = s.replace(/\s*=\s*/g, '=');
        s = s.replace(/ ;/g, ';');
        if (!s.startsWith('<svg')) {
            const match = s.match(/<svg[\s\S]*<\/svg>/i);
            if (match) s = match[0];
        }
        return s.trim();
    }

    let optimizedBlob = null;

    function isSvgFile(file) {
        return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
    }

    window.NexusTools.runWhenReady(() => {
        const input = document.getElementById('svg-input');
        const before = document.getElementById('svg-before');
        const after = document.getElementById('svg-after');
        const beforeSize = document.getElementById('svg-before-size');
        const afterSize = document.getElementById('svg-after-size');
        const dl = document.getElementById('svg-download');

        async function processSvgFile(file) {
            if (!file) return;
            if (!isSvgFile(file)) {
                toast('Choose an SVG file.', 'warn');
                return;
            }
            try {
                const text = await file.text();
                before.value = text.slice(0, 120000);
                beforeSize.textContent = `Original: ${formatBytes(file.size)}`;
                const out = optimizeSvg(text);
                after.value = out.slice(0, 120000);
                const saved = Math.max(0, ((file.size - out.length) / file.size) * 100);
                afterSize.textContent = `Optimized: ${formatBytes(out.length)} (${saved.toFixed(0)}% smaller)`;
                optimizedBlob = new Blob([out], { type: 'image/svg+xml' });
                dl.disabled = false;
                toast('SVG optimized.', 'success');
            } catch (err) {
                NexusTools.reportError(err, { tool: 'svg' });
                toast(err.message || 'Could not read SVG', 'error');
            }
        }

        input?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            await processSvgFile(file);
            e.target.value = '';
        });

        bindDropZone?.(document.getElementById('svg-drop'), input, (files) => {
            processSvgFile(files[0]);
        });

        dl?.addEventListener('click', () => {
            if (optimizedBlob) downloadBlob(optimizedBlob, 'optimized.svg', 'svg');
        });
    });
})();
