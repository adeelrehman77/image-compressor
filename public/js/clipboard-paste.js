(function () {
    'use strict';

    const PASTE_TOAST_MS = 2500;

    function tf(key, vars, fallback) {
        const s = window.__NEXUS_TF ? window.__NEXUS_TF(key, vars) : '';
        return s || fallback || key;
    }

    function activeTool() {
        return window.__NEXUS_TOOL_SHELL?.parseTool?.() || 'compress';
    }

    function toast(message, type) {
        if (window.NexusTools?.toast) {
            window.NexusTools.toast(message, type);
            return;
        }
        const root = document.getElementById('toast-root');
        if (!root) return;
        const el = document.createElement('div');
        el.className = `toast toast-${type || 'info'}`;
        el.setAttribute('role', 'alert');
        el.textContent = message;
        root.appendChild(el);
        setTimeout(() => el.classList.add('toast-out'), PASTE_TOAST_MS);
        setTimeout(() => el.remove(), PASTE_TOAST_MS + 600);
    }

    function pasteToast() {
        toast(tf('toastPasted', null, '📋 Image pasted from clipboard'), 'info');
    }

    async function blobFromClipboardItem(item) {
        if (item.getType) {
            const type = (item.types || []).find((t) => /^image\//.test(t));
            if (!type) return null;
            return item.getType(type);
        }
        if (item instanceof Blob) return item;
        return null;
    }

    async function readClipboardImage(e) {
        if (e?.clipboardData?.files?.length) {
            const f = [...e.clipboardData.files].find((file) => /^image\//.test(file.type));
            if (f) return f;
            const items = e.clipboardData.items;
            if (items) {
                for (const item of items) {
                    if (item.kind === 'file' && /^image\//.test(item.type)) {
                        return item.getAsFile();
                    }
                }
            }
        }

        if (!navigator.clipboard?.read) return null;
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = (item.types || []).find((t) => /^image\//.test(t));
                if (!type) continue;
                const blob = await blobFromClipboardItem(item);
                if (blob) {
                    const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
                    return new File([blob], `pasted-${Date.now()}.${ext}`, { type });
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    async function routePaste(file) {
        const tool = activeTool();
        pasteToast();

        if (tool === 'compress' && window.__NEXUS_COMPRESS_ADD_FILES) {
            window.__NEXUS_COMPRESS_ADD_FILES([file]);
            return;
        }
        if (tool === 'image-cropper' && window.__NEXUS_CROPPER_LOAD_FILE) {
            await window.__NEXUS_CROPPER_LOAD_FILE(file);
            return;
        }
        if (tool === 'photo-checker' && window.__NEXUS_PHOTO_CHECKER_LOAD_FILE) {
            await window.__NEXUS_PHOTO_CHECKER_LOAD_FILE(file);
            return;
        }
        if (tool === 'redactor' && window.__NEXUS_REDACTOR_LOAD_FILE) {
            await window.__NEXUS_REDACTOR_LOAD_FILE(file);
            return;
        }
        if (tool === 'ai-upscaler' && window.__NEXUS_UPSCALER_LOAD_FILE) {
            await window.__NEXUS_UPSCALER_LOAD_FILE(file);
            return;
        }
        if (tool === 'format-converter' && window.__NEXUS_FMT_ADD_FILES) {
            window.__NEXUS_FMT_ADD_FILES([file]);
            return;
        }
        if (tool === 'heic-converter') {
            toast(tf('heicPasteUnsupported', null, 'HEIC paste not supported — please use Choose Files'), 'warn');
            return;
        }
        if (window.__NEXUS_NAVIGATE_TOOL) {
            await window.__NEXUS_NAVIGATE_TOOL('compress');
        }
        window.__NEXUS_COMPRESS_ADD_FILES?.([file]);
    }

    function shouldIgnorePaste(e) {
        const t = e.target;
        if (!t) return false;
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (t.isContentEditable) return true;
        return false;
    }

    async function onPaste(e) {
        if (shouldIgnorePaste(e)) return;
        const file = await readClipboardImage(e);
        if (!file) return;
        e.preventDefault();
        try {
            await routePaste(file);
        } catch (err) {
            window.NexusSentry?.captureException?.(err, { tool: 'clipboard', action: 'paste' });
            toast(tf('pasteFailed', null, 'Could not paste image from clipboard.'), 'error');
        }
    }

    document.addEventListener('paste', onPaste);
})();
