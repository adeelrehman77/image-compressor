(function () {
    const META = window.__NEXUS_TOOL_META || {};
    const TAGLINES = META.taglines || {};

    /** Hash SPA shares one URL with / — FAQPage must live on /guides/ only (see scripts/seo-faq-policy.js). */
    function stripFaqJsonLdFromHashDocument() {
        document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
            if (/FAQPage/.test(script.textContent || '')) {
                script.remove();
            }
        });
    }
    stripFaqJsonLdFromHashDocument();

    let internalNav = false;
    let activateGen = 0;

    function hashToTool(hash) {
        const main = hash.includes('/') ? hash.split('/')[0] : hash;
        if (main === 'photo-studio' || main === 'passport-studio') return 'passport-studio';
        if (
            main === 'images-to-pdf' ||
            main === 'pdf-suite' ||
            main === 'svg' ||
            main === 'heic-converter' ||
            main === 'format-converter' ||
            main === 'image-cropper' ||
            main === 'collage-maker' ||
            main === 'remove-bg' ||
            main === 'photo-checker' ||
            main === 'redactor' ||
            main === 'ai-upscaler'
        ) {
            return main;
        }
        return TAGLINES[main] ? main : null;
    }

    function parseToolFromLocation() {
        if (window.__NEXUS_INITIAL_TOOL && TAGLINES[window.__NEXUS_INITIAL_TOOL]) {
            return window.__NEXUS_INITIAL_TOOL;
        }
        const fromPath = window.__NEXUS_TOOL_ROUTES?.parsePathname?.(location.pathname);
        if (fromPath) return fromPath;
        const hash = (location.hash || '').replace(/^#/, '').trim();
        const main = hash.includes('/') ? hash.split('/')[0] : hash;
        return hashToTool(main) || 'compress';
    }

    function parseTool() {
        return parseToolFromLocation();
    }

    function publicHash(tool) {
        return tool === 'passport-studio' ? 'photo-studio' : tool;
    }

    function syncUrl(tool) {
        internalNav = true;
        try {
            const locale = window.__NEXUS_LOCALE || 'en';
            const search = location.search || '';
            if (tool === 'compress') {
                history.replaceState(null, '', (locale === 'ar' ? '/ar/' : '/') + search);
                return;
            }
            if (tool === 'pdf-suite') {
                const base = window.__NEXUS_TOOL_ROUTES?.pathFor?.(tool, locale) || '/tools/pdf-merge/';
                const sub = window.NexusTools?.parsePdfSuiteSubTab?.();
                const hash = sub && sub !== 'merge' ? `#pdf-suite/${sub}` : '';
                history.replaceState(null, '', base + search + hash);
                return;
            }
            if (window.__NEXUS_TOOL_ROUTES?.pathFor) {
                history.replaceState(null, '', window.__NEXUS_TOOL_ROUTES.pathFor(tool, locale) + search);
                return;
            }
            const hash = `#${publicHash(tool)}`;
            if (location.hash !== hash) location.hash = publicHash(tool);
        } finally {
            internalNav = false;
        }
    }

    async function prepareTool(tool) {
        if (tool === 'compress') return;
        try {
            await window.NexusTools?.ensureTool?.(tool);
            if (tool === 'photo-checker') {
                await window.__NEXUS_PHOTO_CHECKER_ACTIVATE?.();
            }
            if (tool === 'ai-upscaler') {
                await window.__NEXUS_UPSCALER_ACTIVATE?.();
            }
            if (tool === 'remove-bg') {
                await window.__NEXUS_REMOVE_BG_ACTIVATE?.();
            }
            if (tool === 'images-to-pdf' || tool === 'pdf-suite') {
                await window.NexusTools?.loadPdfLib?.();
            }
        } catch (err) {
            const msg =
                window.__NEXUS_T?.('toolLoadFailed') ||
                'This tool failed to load. Check your connection and refresh the page.';
            window.NexusTools?.toast?.(msg, 'error');
            throw err;
        }
    }

    function shouldPreloadToolsIdle() {
        if (window.matchMedia('(max-width: 780px)').matches) return false;
        const conn = navigator.connection;
        if (conn?.saveData) return false;
        if (conn?.effectiveType && /(^2g$)|slow-2g/.test(conn.effectiveType)) return false;
        return true;
    }

    function preloadToolsIdle() {
        if (!shouldPreloadToolsIdle()) return;
        const run = () => {
            ['images-to-pdf', 'pdf-suite', 'svg', 'heic-converter', 'format-converter', 'image-cropper', 'collage-maker'].forEach((tool) => {
                window.NexusTools?.ensureTool?.(tool).catch(() => {});
            });
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(run, { timeout: 5000 });
        } else {
            setTimeout(run, 2000);
        }
    }

    function bindHeaderHeight() {
        const header = document.querySelector('.site-header');
        if (!header) return;
        const sync = () => {
            document.documentElement.style.setProperty('--site-header-height', `${header.offsetHeight}px`);
        };
        sync();
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(sync).observe(header);
        } else {
            window.addEventListener('resize', sync);
        }
    }

    function updateDocumentMeta(tool) {
        window.__NEXUS_TOOL_SHELL?.applyHeadMeta?.(tool);
    }

    function updateSeoContent(tool) {
        /* applied via applyToolState in setTool */
    }

    function updateAriaTabs(tool) {
        /* applied via applyToolState in setTool */
    }

    function scrollActiveTabIntoView(tool) {
        const tab = document.querySelector(`.tool-nav-link[data-tool="${tool}"]`);
        tab?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }

    function setTool(id) {
        const tool = TAGLINES[id] ? id : 'compress';
        window.__NEXUS_TOOL_SHELL?.applyToolState?.(tool);
        window.NexusSentry?.setTool(tool);
        scrollActiveTabIntoView(tool);
        if (tool === 'pdf-suite') {
            const sub = window.NexusTools?.parsePdfSuiteSubTab?.();
            if (sub) window.__NEXUS_PDF_SUITE_ACTIVATE?.(sub);
        }
    }

    async function activateTool(tool) {
        const gen = ++activateGen;
        await prepareTool(tool);
        if (gen !== activateGen) return;
        setTool(tool);
        syncUrl(tool);
    }

    async function navigateToTool(tool) {
        document.querySelector('.app-main')?.classList.add('tool-switching');
        try {
            await activateTool(tool);
            window.scrollTo(0, 0);
        } catch (err) {
            window.NexusSentry?.captureException?.(err, { tool: 'router', action: 'navigate', target: tool });
        } finally {
            document.querySelector('.app-main')?.classList.remove('tool-switching');
        }
    }

    async function onNavClick(e) {
        const link = e.target.closest('.tool-nav-link');
        if (!link) return;
        e.preventDefault();
        await navigateToTool(link.dataset.tool || 'compress');
    }

    function bindRouter() {
        if (window.__nexusToolRouterBound) return;
        window.__nexusToolRouterBound = true;

        if (window.__nexusShellHashSync) {
            window.removeEventListener('hashchange', window.__nexusShellHashSync);
        }

        const nav = document.querySelector('.site-header-tools');
        if (nav) {
            const fresh = nav.cloneNode(true);
            nav.replaceWith(fresh);
            fresh.addEventListener('click', onNavClick);
            fresh.addEventListener('keydown', (e) => {
                const tabs = [...fresh.querySelectorAll('[role="tab"]')];
                const cur = tabs.findIndex(t => t === document.activeElement);
                if (cur === -1) return;
                const rtl = document.documentElement.getAttribute('dir') === 'rtl'
                    || getComputedStyle(fresh).direction === 'rtl';
                let next = -1;
                const goNext = e.key === 'ArrowDown' || (rtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight');
                const goPrev = e.key === 'ArrowUp' || (rtl ? e.key === 'ArrowRight' : e.key === 'ArrowLeft');
                if (goNext) { e.preventDefault(); next = (cur + 1) % tabs.length; }
                else if (goPrev) { e.preventDefault(); next = (cur - 1 + tabs.length) % tabs.length; }
                else if (e.key === 'Home') { e.preventDefault(); next = 0; }
                else if (e.key === 'End') { e.preventDefault(); next = tabs.length - 1; }
                if (next !== -1) {
                    tabs[cur].setAttribute('tabindex', '-1');
                    tabs[next].setAttribute('tabindex', '0');
                    tabs[next].focus();
                }
            });
        }
        document.querySelector('.seo-tool-chips')?.addEventListener('click', async (e) => {
            const chip = e.target.closest('a[href^="#"]');
            if (!chip) return;
            const hash = chip.getAttribute('href')?.replace(/^#/, '').trim();
            const tool = hash ? hashToTool(hash) : null;
            if (tool) {
                e.preventDefault();
                await navigateToTool(tool);
            }
        });
        document.querySelector('[data-tool-home]')?.addEventListener('click', async (e) => {
            if (location.pathname.endsWith('index.html') || location.pathname.endsWith('/')) {
                e.preventDefault();
                await navigateToTool('compress');
            }
        });
        document.querySelector('.hero-callout')?.addEventListener('click', onNavClick);
        document.querySelector('#panel-compress')?.addEventListener('click', onNavClick);
        window.__NEXUS_NAVIGATE_TOOL = navigateToTool;
        window.addEventListener('hashchange', () => {
            if (internalNav) return;
            navigateToTool(parseTool());
        });
    }

    async function boot() {
        bindHeaderHeight();
        await navigateToTool(parseTool());
        preloadToolsIdle();
    }

    bindRouter();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            boot().catch((err) => {
                window.NexusSentry?.captureException?.(err, { tool: 'router', action: 'boot' });
            });
        });
    } else {
        boot().catch((err) => {
            window.NexusSentry?.captureException?.(err, { tool: 'router', action: 'boot' });
        });
    }
})();
