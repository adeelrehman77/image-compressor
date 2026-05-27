(function () {
    'use strict';

    const { toast, formatBytes, bindDropZone, runWhenReady, loadExternalScript } = window.NexusTools;

    const FACE_API_JS =
        'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    const MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

    const PORTALS = {
        'emirates-ica': { limitKb: 200, nameKey: 'pcPortalEmirates' },
        'mohre-worker': { limitKb: 200, nameKey: 'pcPortalMohreWorker' },
        'uae-visa': { limitKb: 200, nameKey: 'pcPortalUaeVisa' },
        'mohre-doc': { limitKb: 500, nameKey: 'pcPortalMohreDoc' },
    };

    const CHECK_IDS = [
        'faceDetected',
        'faceSize',
        'faceCentered',
        'eyesOpen',
        'headTilt',
        'fileFormat',
        'fileSize',
        'dimensions',
        'background',
        'glasses',
    ];

    const STUDIO_FIX_KEYS = {
        faceSize: 'pcFixFaceSize',
        faceCentered: 'pcFixCentered',
        headTilt: 'pcFixTilt',
        dimensions: 'pcFixDimensions',
        fileSize: 'pcFixFileSize',
    };

    let modelsPromise = null;
    let modelsReady = false;
    let modelsFailed = false;
    let currentFile = null;
    let previewUrl = null;
    let imageEl = null;
    let analysisCanvas = null;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    function portalName(portalId) {
        const cfg = PORTALS[portalId] || PORTALS['emirates-ica'];
        return tf(cfg.nameKey, null, portalId);
    }

    function dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function avgPoint(points) {
        const n = points.length || 1;
        let x = 0;
        let y = 0;
        points.forEach((p) => {
            x += p.x;
            y += p.y;
        });
        return { x: x / n, y: y / n };
    }

    function eyeAspectRatio(eyePoints) {
        if (!eyePoints || eyePoints.length < 6) return 0;
        const p = eyePoints;
        const vertical = dist(p[1], p[5]) + dist(p[2], p[4]);
        const horizontal = dist(p[0], p[3]) || 1;
        return vertical / (2 * horizontal);
    }

    function isJpegOrPng(file) {
        if (!file) return false;
        const t = (file.type || '').toLowerCase();
        if (t === 'image/jpeg' || t === 'image/png') return true;
        return /\.(jpe?g|png)$/i.test(file.name || '');
    }

    async function loadFaceApiScript() {
        if (typeof faceapi !== 'undefined') return;
        await loadExternalScript(FACE_API_JS);
    }

    async function loadModels() {
        if (modelsReady) return true;
        if (modelsFailed) return false;
        if (modelsPromise) return modelsPromise;

        const loadingEl = document.getElementById('pc-models-loading');
        loadingEl?.classList.remove('is-hidden');

        modelsPromise = (async () => {
            try {
                await loadFaceApiScript();
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE),
                    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_BASE),
                    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_BASE),
                ]);
                modelsReady = true;
                return true;
            } catch (err) {
                modelsFailed = true;
                window.NexusSentry?.captureException?.(err, { tool: 'photo-checker', action: 'load-models' });
                document.getElementById('pc-models-error')?.classList.remove('is-hidden');
                document.getElementById('pc-manual-checklist')?.classList.remove('is-hidden');
                return false;
            } finally {
                loadingEl?.classList.add('is-hidden');
            }
        })();

        return modelsPromise;
    }

    window.__NEXUS_PHOTO_CHECKER_ACTIVATE = async function activatePhotoChecker() {
        if (!modelsReady && !modelsFailed) await loadModels();
    };

    function releasePreview() {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }
        currentFile = null;
        imageEl = null;
    }

    function setPreviewVisible(visible) {
        document.getElementById('pc-drop-zone')?.classList.toggle('is-hidden', visible);
        document.getElementById('pc-preview-wrap')?.classList.toggle('is-hidden', !visible);
        document.getElementById('pc-actions')?.classList.toggle('is-hidden', !visible);
        document.getElementById('pc-reset-btn')?.classList.toggle('is-hidden', !visible);
    }

    function resetResults() {
        document.getElementById('pc-results-panel')?.classList.add('is-hidden');
        document.getElementById('pc-results-empty')?.classList.remove('is-hidden');
        document.getElementById('pc-cta-wrap')?.classList.add('is-hidden');
        document.getElementById('pc-check-list').innerHTML = '';
        document.getElementById('pc-verdict-badge').textContent = '';
        document.getElementById('pc-score').textContent = '';
    }

    async function loadPhotoFile(file) {
        if (!isJpegOrPng(file)) {
            toast(tf('pcNeedJpegPng', null, 'Please use a JPEG or PNG photo.'), 'warn');
            return;
        }
        releasePreview();
        currentFile = file;
        previewUrl = URL.createObjectURL(file);
        imageEl = document.getElementById('pc-preview-img');
        if (!imageEl) return;
        imageEl.src = previewUrl;
        imageEl.alt = file.name;
        setPreviewVisible(true);
        resetResults();
        document.getElementById('pc-status').textContent = tf(
            'pcStatusLoaded',
            { name: file.name },
            `${file.name} ready — select portal and run check.`
        );
        document.getElementById('pc-run-btn').disabled = false;
    }

    function drawAnalysisCanvas(img) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!analysisCanvas) analysisCanvas = document.createElement('canvas');
        analysisCanvas.width = w;
        analysisCanvas.height = h;
        const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        return { canvas: analysisCanvas, w, h, ctx };
    }

    function sampleBackgroundBrightness(ctx, w, h, faceBox) {
        const pad = Math.max(8, Math.round(Math.min(w, h) * 0.02));
        const fx = faceBox.x - pad;
        const fy = faceBox.y - pad;
        const fw = faceBox.width + pad * 2;
        const fh = faceBox.height + pad * 2;

        const points = [];
        const step = Math.max(4, Math.round(Math.min(w, h) / 40));
        for (let x = pad; x < w - pad; x += step) {
            points.push([x, pad], [x, h - pad]);
        }
        for (let y = pad; y < h - pad; y += step) {
            points.push([pad, y], [w - pad, y]);
        }

        const samples = [];
        for (const [x, y] of points) {
            if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) continue;
            const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            samples.push(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]);
        }
        if (!samples.length) return 128;
        return samples.reduce((a, b) => a + b, 0) / samples.length;
    }

    function glassesLikely(ctx, landmarks, w, h) {
        try {
            const left = landmarks.getLeftEye();
            const right = landmarks.getRightEye();
            const browY = Math.min(...left.map((p) => p.y), ...right.map((p) => p.y)) - 6;
            const eyeY = (avgPoint(left).y + avgPoint(right).y) / 2;
            const x0 = Math.max(0, Math.floor(Math.min(...left.map((p) => p.x)) - 12));
            const x1 = Math.min(w - 1, Math.ceil(Math.max(...right.map((p) => p.x)) + 12));
            const y0 = Math.max(0, Math.floor(browY));
            const y1 = Math.min(h - 1, Math.ceil(eyeY + 4));
            const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
            let edges = 0;
            let total = 0;
            for (let i = 0; i < region.length; i += 4) {
                const lum = 0.299 * region[i] + 0.587 * region[i + 1] + 0.114 * region[i + 2];
                total += lum;
                if (i > 0) {
                    const prev = 0.299 * region[i - 4] + 0.587 * region[i - 3] + 0.114 * region[i - 2];
                    if (Math.abs(lum - prev) > 28) edges += 1;
                }
            }
            const pixels = region.length / 4 || 1;
            const edgeRatio = edges / pixels;
            const avg = total / pixels;
            return edgeRatio > 0.12 && avg < 200;
        } catch {
            return false;
        }
    }

    async function detectFaces(img) {
        const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
        const all = await faceapi.detectAllFaces(img, opts).withFaceLandmarks(true);
        return all.filter((d) => d.detection.score >= 0.7);
    }

    function buildChecks(file, img, portalId, detection) {
        const portal = PORTALS[portalId] || PORTALS['emirates-ica'];
        const portalLabel = portalName(portalId);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const checks = [];

        const push = (id, status, message) => {
            checks.push({
                id,
                status,
                name: tf(`pcCheck_${id}_name`, null, id),
                message: message || tf(`pcCheck_${id}_${status}`, null, ''),
            });
        };

        if (!detection || !detection.length) {
            push(
                'faceDetected',
                'fail',
                tf('pcFailNoFace', null, 'No face detected — make sure the photo is well-lit and the face is clearly visible')
            );
            push('faceSize', 'warn', tf('pcWarnSkipped', null, 'Could not verify — no face detected'));
            push('faceCentered', 'warn', tf('pcWarnSkipped', null, 'Could not verify — no face detected'));
            push('eyesOpen', 'warn', tf('pcWarnSkipped', null, 'Could not verify — no face detected'));
            push('headTilt', 'warn', tf('pcWarnSkipped', null, 'Could not verify — no face detected'));
            push('glasses', 'warn', tf('pcWarnSkipped', null, 'Could not verify — no face detected'));
        } else if (detection.length > 1) {
            push(
                'faceDetected',
                'fail',
                tf('pcFailMultiFace', null, 'Multiple faces detected — photo must contain only one person')
            );
            push('faceSize', 'warn', tf('pcWarnSkipped', null, 'Could not verify — multiple faces'));
            push('faceCentered', 'warn', tf('pcWarnSkipped', null, 'Could not verify — multiple faces'));
            push('eyesOpen', 'warn', tf('pcWarnSkipped', null, 'Could not verify — multiple faces'));
            push('headTilt', 'warn', tf('pcWarnSkipped', null, 'Could not verify — multiple faces'));
            push('glasses', 'warn', tf('pcWarnSkipped', null, 'Could not verify — multiple faces'));
        } else {
            const face = detection[0];
            const box = face.detection.box;
            const lm = face.landmarks;

            push('faceDetected', 'pass', tf('pcPassFace', null, 'One face detected'));

            const faceRatio = box.height / h;
            if (faceRatio >= 0.65 && faceRatio <= 0.85) {
                push('faceSize', 'pass', tf('pcPassFaceSize', null, 'Face fills 65–85% of photo height'));
            } else if (faceRatio < 0.65) {
                push(
                    'faceSize',
                    'fail',
                    tf(
                        'pcFailFaceSmall',
                        null,
                        'Face is too small — move closer or crop tighter. Face should fill at least 65% of the photo height'
                    )
                );
            } else {
                push(
                    'faceSize',
                    'fail',
                    tf(
                        'pcFailFaceLarge',
                        null,
                        'Face is too close — the top of the head may be cut off'
                    )
                );
            }

            const faceCenterX = box.x + box.width / 2;
            const offset = Math.abs(faceCenterX - w / 2) / w;
            if (offset <= 0.15) {
                push('faceCentered', 'pass', tf('pcPassCentered', null, 'Face is centred horizontally'));
            } else {
                push(
                    'faceCentered',
                    'fail',
                    tf(
                        'pcFailCentered',
                        null,
                        'Face is not centred — reposition so the face is in the middle of the photo'
                    )
                );
            }

            const leftEye = lm.getLeftEye();
            const rightEye = lm.getRightEye();
            const ear = (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2;
            if (ear > 0.2) {
                push('eyesOpen', 'pass', tf('pcPassEyes', null, 'Eyes appear open'));
            } else {
                push(
                    'eyesOpen',
                    'fail',
                    tf(
                        'pcFailEyes',
                        null,
                        'Eyes appear closed — eyes must be fully open and looking at the camera'
                    )
                );
            }

            const le = avgPoint(leftEye);
            const re = avgPoint(rightEye);
            const tiltDeg = Math.abs((Math.atan2(re.y - le.y, re.x - le.x) * 180) / Math.PI);
            if (tiltDeg < 5) {
                push('headTilt', 'pass', tf('pcPassTilt', null, 'Head is level'));
            } else {
                push(
                    'headTilt',
                    'fail',
                    tf('pcFailTilt', null, 'Head is tilted — keep your head straight and level')
                );
            }

            const { ctx } = drawAnalysisCanvas(img);
            if (glassesLikely(ctx, lm, w, h)) {
                push(
                    'glasses',
                    'warn',
                    tf(
                        'pcWarnGlasses',
                        null,
                        'Glasses may be present — ICA and Emirates ID photos require no glasses'
                    )
                );
            } else {
                push('glasses', 'pass', tf('pcPassGlasses', null, 'No glasses detected (approximate)'));
            }
        }

        if (isJpegOrPng(file) && (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name))) {
            push('fileFormat', 'pass', tf('pcPassFormat', null, 'JPEG format'));
        } else if (isJpegOrPng(file) && file.type === 'image/png') {
            push(
                'fileFormat',
                'fail',
                tf(
                    'pcFailFormat',
                    null,
                    'Wrong format — UAE portals only accept JPEG. Convert using Format Converter'
                )
            );
        } else {
            push(
                'fileFormat',
                'fail',
                tf(
                    'pcFailFormat',
                    null,
                    'Wrong format — UAE portals only accept JPEG. Convert using Format Converter'
                )
            );
        }

        const sizeKb = file.size / 1024;
        if (file.size <= portal.limitKb * 1024) {
            push(
                'fileSize',
                'pass',
                tf('pcPassFileSize', { limit: portal.limitKb, portal: portalLabel }, `Under ${portal.limitKb} KB for ${portalLabel}`)
            );
        } else {
            push(
                'fileSize',
                'fail',
                tf(
                    'pcFailFileSize',
                    { size: sizeKb.toFixed(0), limit: portal.limitKb, portal: portalLabel },
                    `File is ${sizeKb.toFixed(0)} KB — exceeds the ${portal.limitKb} KB limit for ${portalLabel}. Compress it using the Image Compressor`
                )
            );
        }

        if (w >= 300 && h >= 300) {
            if (w >= 600 && h >= 800) {
                push('dimensions', 'pass', tf('pcPassDimensions', { w, h }, `${w}×${h} px — meets recommended size`));
            } else {
                push(
                    'dimensions',
                    'warn',
                    tf(
                        'pcWarnDimensions',
                        { w, h },
                        `Image is ${w}×${h} px — 600×800 px or larger is recommended for portal uploads`
                    )
                );
            }
        } else {
            push(
                'dimensions',
                'fail',
                tf(
                    'pcFailDimensions',
                    { w, h },
                    `Image is too small (${w}×${h} px) — use at least 600×800 px for portal uploads`
                )
            );
        }

        if (detection && detection.length === 1) {
            const { ctx } = drawAnalysisCanvas(img);
            const bright = sampleBackgroundBrightness(ctx, w, h, detection[0].detection.box);
            if (bright > 200) {
                push('background', 'pass', tf('pcPassBackground', null, 'Background appears white or light'));
            } else if (bright >= 150) {
                push(
                    'background',
                    'warn',
                    tf(
                        'pcWarnBackground',
                        null,
                        'Background may not be white — UAE portals require a plain white or off-white background'
                    )
                );
            } else {
                push(
                    'background',
                    'fail',
                    tf(
                        'pcFailBackground',
                        null,
                        'Background appears dark or coloured — use a plain white background'
                    )
                );
            }
        } else {
            push('background', 'warn', tf('pcWarnSkipped', null, 'Could not verify background — no face detected'));
        }

        return checks.sort((a, b) => CHECK_IDS.indexOf(a.id) - CHECK_IDS.indexOf(b.id));
    }

    function iconForStatus(status) {
        if (status === 'pass') return '✅';
        if (status === 'fail') return '❌';
        return '⚠️';
    }

    function renderCheckRow(check, visible) {
        const li = document.createElement('li');
        li.className = `pc-check-item pc-check-item--${check.status}`;
        if (!visible) li.classList.add('pc-check-item--pending');
        li.innerHTML = `
            <span class="pc-check-icon" aria-hidden="true">${iconForStatus(check.status)}</span>
            <div class="pc-check-body">
                <span class="pc-check-name">${check.name}</span>
                <span class="pc-check-msg">${check.message}</span>
            </div>`;
        if (check.id === 'glasses' && visible) {
            const note = document.createElement('p');
            note.className = 'pc-check-note';
            note.textContent = tf('pcGlassesNote', null, 'Glasses detection is approximate');
            li.querySelector('.pc-check-body')?.appendChild(note);
        }
        return li;
    }

    function animateResults(checks, passed, total) {
        const list = document.getElementById('pc-check-list');
        const badge = document.getElementById('pc-verdict-badge');
        const score = document.getElementById('pc-score');
        const panel = document.getElementById('pc-results-panel');
        const empty = document.getElementById('pc-results-empty');

        list.innerHTML = '';
        panel?.classList.remove('is-hidden');
        empty?.classList.add('is-hidden');
        badge.textContent = '';
        badge.className = 'pc-verdict-badge';
        score.textContent = '';

        checks.forEach((check, i) => {
            const li = renderCheckRow(check, false);
            list.appendChild(li);
            setTimeout(() => {
                li.classList.remove('pc-check-item--pending');
                li.classList.add('pc-check-item--reveal');
            }, i * 150);
        });

        const summaryDelay = checks.length * 150 + 200;
        setTimeout(() => {
            const fail = checks.some((c) => c.status === 'fail');
            badge.textContent = fail
                ? `❌ ${tf('pcFail', null, 'FAIL')}`
                : `✅ ${tf('pcPass', null, 'PASS')}`;
            badge.classList.add(fail ? 'pc-verdict-badge--fail' : 'pc-verdict-badge--pass');
            score.textContent = tf(
                'pcScore',
                { passed, total },
                `${passed} / ${total} checks passed`
            );
            updateCta(checks, !fail);
        }, summaryDelay);
    }

    function updateCta(checks, overallPass) {
        const wrap = document.getElementById('pc-cta-wrap');
        const btn = document.getElementById('pc-cta-btn');
        const fixesEl = document.getElementById('pc-studio-fixes');
        if (!wrap || !btn) return;

        wrap.classList.remove('is-hidden');
        fixesEl?.classList.add('is-hidden');
        fixesEl.textContent = '';

        if (overallPass) {
            btn.textContent = tf('pcSendStudio', null, 'Send to ID Photo Studio →');
            btn.dataset.action = 'pass';
        } else {
            btn.textContent = tf('pcFixStudio', null, 'Fix in ID Photo Studio →');
            btn.dataset.action = 'fail';
            const fixLines = [];
            checks.forEach((c) => {
                if (c.status === 'fail' && STUDIO_FIX_KEYS[c.id]) {
                    fixLines.push(tf(STUDIO_FIX_KEYS[c.id], null, c.name));
                }
            });
            if (fixLines.length) {
                fixesEl.classList.remove('is-hidden');
                fixesEl.innerHTML = `<strong>${tf('pcStudioCanFix', null, 'ID Photo Studio can help with:')}</strong><ul>${fixLines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
            }
        }
    }

    async function runCheck() {
        if (!currentFile || !imageEl) {
            toast(tf('pcNeedPhoto', null, 'Choose a photo first.'), 'warn');
            return;
        }

        const runBtn = document.getElementById('pc-run-btn');
        const statusEl = document.getElementById('pc-status');
        runBtn.disabled = true;
        statusEl.textContent = tf('pcStatusChecking', null, 'Running compliance checks…');

        const portalId = document.getElementById('pc-portal-select')?.value || 'emirates-ica';

        await new Promise((r) => {
            if (imageEl.complete) r();
            else imageEl.onload = r;
        });

        let detection = null;
        const modelsOk = modelsReady || (await loadModels());
        if (modelsOk) {
            try {
                detection = await detectFaces(imageEl);
            } catch (err) {
                window.NexusSentry?.captureException?.(err, { tool: 'photo-checker', action: 'detect' });
                toast(tf('pcDetectError', null, 'Face detection failed. Try another photo.'), 'error');
            }
        }

        const checks = buildChecks(currentFile, imageEl, portalId, detection);
        const passed = checks.filter((c) => c.status === 'pass').length;
        animateResults(checks, passed, checks.length);

        statusEl.textContent = tf('pcStatusDone', null, 'Check complete.');
        runBtn.disabled = false;
    }

    async function sendToPassportStudio() {
        if (!currentFile) return;
        try {
            await window.NexusTools.ensureTool('passport-studio');
            if (window.__NEXUS_NAVIGATE_TOOL) await window.__NEXUS_NAVIGATE_TOOL('passport-studio');
            if (window.NexusPassportStudio?.loadPhoto) {
                await window.NexusPassportStudio.loadPhoto(currentFile, 'uae-emirates');
            } else {
                toast(tf('pcStudioUnavailable', null, 'ID Photo Studio is not ready. Refresh and try again.'), 'error');
            }
        } catch (err) {
            window.NexusSentry?.captureException?.(err, { tool: 'photo-checker', action: 'send-studio' });
            toast(tf('pcStudioUnavailable', null, 'Could not open ID Photo Studio.'), 'error');
        }
    }

    function resetAll() {
        releasePreview();
        setPreviewVisible(false);
        resetResults();
        document.getElementById('pc-status').textContent = '';
        document.getElementById('pc-run-btn').disabled = true;
    }

    runWhenReady(() => {
        const dropZone = document.getElementById('pc-drop-zone');
        const fileInput = document.getElementById('pc-file-input');
        if (!dropZone) return;

        bindDropZone(dropZone, fileInput, (files) => {
            const f = [...files].find(isJpegOrPng);
            if (f) loadPhotoFile(f);
            else toast(tf('pcNeedJpegPng', null, 'Please use a JPEG or PNG photo.'), 'warn');
        });

        fileInput?.addEventListener('change', () => {
            const f = fileInput.files?.[0];
            if (f) loadPhotoFile(f);
            fileInput.value = '';
        });

        document.getElementById('pc-run-btn')?.addEventListener('click', () => runCheck());
        document.getElementById('pc-reset-btn')?.addEventListener('click', resetAll);
        document.getElementById('pc-cta-btn')?.addEventListener('click', sendToPassportStudio);
    });

    window.__NEXUS_PHOTO_CHECKER_LOAD_FILE = loadPhotoFile;
})();
