(function () {
    const META = window.__NEXUS_TOOL_META || {};
    const TAGLINES = META.taglines || {};

    let internalNav = false;
    let activateGen = 0;

    function parseTool() {
        const hash = (location.hash || '').replace(/^#/, '').trim();
        if (hash === 'images-to-pdf' || hash === 'pdf-suite' || hash === 'svg' || hash === 'passport-studio') {
            return hash;
        }
        return 'compress';
    }

    function syncHash(tool) {
        internalNav = true;
        try {
            if (tool === 'compress') {
                if (location.hash) {
                    history.replaceState(null, '', location.pathname + location.search);
                }
            } else if (location.hash !== `#${tool}`) {
                location.hash = tool;
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
            window.NexusTools?.toast?.(
                'This tool failed to load. Check your connection and refresh the page.',
                'error'
            );
            throw err;
        }
    }

    function preloadToolsIdle() {
        const run = () => {
            ['images-to-pdf', 'pdf-suite', 'svg'].forEach((tool) => {
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
            if (hash && TAGLINES[hash]) {
                e.preventDefault();
                await navigateToTool(hash);
            }
        });
        document.querySelector('[data-tool-home]')?.addEventListener('click', async (e) => {
            if (location.pathname.endsWith('index.html') || location.pathname.endsWith('/')) {
                e.preventDefault();
                await navigateToTool('compress');
            }
        });
        document.querySelector('.hero-callout')?.addEventListener('click', onNavClick);
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
