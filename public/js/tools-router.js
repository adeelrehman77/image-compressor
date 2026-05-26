(function () {
    const META = window.__NEXUS_TOOL_META || {};
    const TAGLINES = META.taglines || {};

    let internalNav = false;
    let activateGen = 0;

    function hashToTool(hash) {
        if (hash === 'photo-studio' || hash === 'passport-studio') return 'passport-studio';
        if (hash === 'images-to-pdf' || hash === 'pdf-suite' || hash === 'svg' || hash === 'heic-converter' || hash === 'format-converter') {
            return hash;
        }
        return TAGLINES[hash] ? hash : null;
    }

    function parseTool() {
        const hash = (location.hash || '').replace(/^#/, '').trim();
        return hashToTool(hash) || 'compress';
    }

    function publicHash(tool) {
        return tool === 'passport-studio' ? 'photo-studio' : tool;
    }

    function syncHash(tool) {
        internalNav = true;
        try {
            if (tool === 'compress') {
                if (location.hash) {
                    history.replaceState(null, '', location.pathname + location.search);
                }
            } else {
                const hash = `#${publicHash(tool)}`;
                if (location.hash !== hash) {
                    location.hash = publicHash(tool);
                }
            }
        } finally {
            internalNav = false;
        }
    }

    async function prepareTool(tool) {
        if (tool === 'compress') return;
        try {
            await window.NexusTools?.ensureTool?.(tool);
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

    function preloadToolsIdle() {
        const run = () => {
            ['images-to-pdf', 'pdf-suite', 'svg', 'heic-converter', 'format-converter'].forEach((tool) => {
                window.NexusTools?.ensureTool?.(tool).catch(() => {});
            });
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(run, { timeout: 5000 });
        } else {
            setTimeout(run, 2000);
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

    function setTool(id) {
        const tool = TAGLINES[id] ? id : 'compress';
        window.__NEXUS_TOOL_SHELL?.applyToolState?.(tool);
        window.NexusSentry?.setTool(tool);
    }

    async function activateTool(tool) {
        const gen = ++activateGen;
        await prepareTool(tool);
        if (gen !== activateGen) return;
        setTool(tool);
        syncHash(tool);
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
