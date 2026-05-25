(function () {
    'use strict';

    let exifrReady = false;
    let exifrPromise = null;

    function loadExifr() {
        if (exifrReady && typeof exifr !== 'undefined') return Promise.resolve();
        if (exifrPromise) return exifrPromise;
        exifrPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/exifr/dist/lite.umd.js';
            s.crossOrigin = 'anonymous';
            s.onload = () => { exifrReady = true; resolve(); };
            s.onerror = () => reject(new Error('Could not load EXIF library'));
            document.head.appendChild(s);
        });
        return exifrPromise;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function formatValue(key, val) {
        if (val == null) return '—';
        if (val instanceof Date) return val.toLocaleString();
        if (key === 'ExposureTime' && typeof val === 'number' && val < 1) {
            return `1/${Math.round(1 / val)}s`;
        }
        if (key === 'FNumber' && typeof val === 'number') return `f/${val}`;
        if (key === 'FocalLength' && typeof val === 'number') return `${val} mm`;
        if (key === 'GPSAltitude' && typeof val === 'number') return `${val.toFixed(1)} m`;
        if (key === 'ColorSpace') return val === 1 ? 'sRGB' : String(val);
        if (key === 'Flash') return val === 0 ? 'No flash' : val === 1 ? 'Flash fired' : String(val);
        if (key === 'Orientation') {
            const map = { 1: 'Normal', 3: 'Rotated 180°', 6: 'Rotated 90° CW', 8: 'Rotated 90° CCW' };
            return map[val] || String(val);
        }
        if (typeof val === 'number' && !Number.isInteger(val)) return val.toFixed(4);
        if (Array.isArray(val)) return val.join(', ');
        return String(val);
    }

    const LABELS = {
        Make: 'Camera Make',
        Model: 'Camera Model',
        DateTimeOriginal: 'Date Taken',
        DateTime: 'Date Modified',
        ExposureTime: 'Shutter Speed',
        FNumber: 'Aperture',
        ISO: 'ISO',
        FocalLength: 'Focal Length',
        GPSLatitude: 'GPS Latitude',
        GPSLongitude: 'GPS Longitude',
        GPSAltitude: 'GPS Altitude',
        ImageWidth: 'Width',
        ImageHeight: 'Height',
        ColorSpace: 'Color Space',
        Software: 'Software',
        Artist: 'Artist',
        Copyright: 'Copyright',
        WhiteBalance: 'White Balance',
        Flash: 'Flash',
        Orientation: 'Orientation',
    };

    // Fields that will be stripped after compression
    const STRIPPED_FIELDS = new Set([
        'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
        'Make', 'Model', 'DateTime', 'DateTimeOriginal',
        'Software', 'Artist', 'Copyright', 'Flash',
        'ISO', 'ExposureTime', 'FNumber', 'FocalLength',
        'Orientation', 'WhiteBalance',
    ]);

    const PRIORITY_KEYS = [
        'Make', 'Model', 'DateTimeOriginal', 'DateTime',
        'ImageWidth', 'ImageHeight', 'ExposureTime', 'FNumber',
        'ISO', 'FocalLength', 'GPSLatitude', 'GPSLongitude',
        'GPSAltitude', 'ColorSpace', 'Flash', 'Orientation',
        'WhiteBalance', 'Software', 'Artist', 'Copyright',
    ];

    async function showExif(file) {
        const modal = document.getElementById('exif-modal');
        if (!modal) return;

        modal.classList.remove('is-hidden');
        modal.removeAttribute('hidden');
        document.body.classList.add('compare-modal-open');

        const titleEl = document.getElementById('exif-modal-title');
        const bodyEl  = document.getElementById('exif-modal-body');
        if (titleEl) titleEl.textContent = file.name;
        if (bodyEl)  bodyEl.innerHTML = '<p class="exif-loading">Reading metadata…</p>';

        try {
            await loadExifr();

            const tags = await exifr.parse(file, {
                tiff: true, exif: true, gps: true,
                xmp: false, iptc: false, icc: false,
                mergeOutput: true,
            });

            if (!tags || !Object.keys(tags).length) {
                if (bodyEl) bodyEl.innerHTML = '<p class="exif-empty">No metadata found in this image.</p>';
                return;
            }

            const rows = [];
            for (const key of PRIORITY_KEYS) {
                if (tags[key] == null) continue;
                const willStrip = STRIPPED_FIELDS.has(key);
                rows.push(`
                    <tr class="${willStrip ? 'exif-row--strip' : ''}">
                        <td class="exif-key">${escapeHtml(LABELS[key] || key)}</td>
                        <td class="exif-val">${escapeHtml(formatValue(key, tags[key]))}</td>
                        <td class="exif-strip">${willStrip ? '<span class="exif-strip-badge">Will be stripped</span>' : ''}</td>
                    </tr>
                `);
            }

            if (!rows.length) {
                if (bodyEl) bodyEl.innerHTML = '<p class="exif-empty">No standard metadata found.</p>';
                return;
            }

            if (bodyEl) {
                bodyEl.innerHTML = `
                    <p class="exif-note">
                        Fields marked <span class="exif-strip-badge">Will be stripped</span> are removed when the image is compressed.
                    </p>
                    <table class="exif-table">
                        <tbody>${rows.join('')}</tbody>
                    </table>
                `;
            }
        } catch (err) {
            if (bodyEl) bodyEl.innerHTML = `<p class="exif-empty">Could not read metadata: ${escapeHtml(err.message)}</p>`;
        }
    }

    function closeExif() {
        const modal = document.getElementById('exif-modal');
        if (!modal) return;
        modal.classList.add('is-hidden');
        modal.setAttribute('hidden', '');
        document.body.classList.remove('compare-modal-open');
    }

    window.NexusExif = { showExif, closeExif };

    window.addEventListener('DOMContentLoaded', () => {
        const modal = document.getElementById('exif-modal');
        if (!modal) return;

        document.getElementById('exif-modal-close')?.addEventListener('click', closeExif);
        modal.querySelector('[data-exif-close]')?.addEventListener('click', closeExif);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) closeExif();
        });
    });
})();
