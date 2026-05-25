(function () {
    'use strict';

    const cfg = window.__NEXUS_ADS;
    if (!cfg?.client) return;

    const LOCAL =
        location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    let loadPromise = null;

    function scheduleIdle(fn, timeout) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(fn, { timeout: timeout || 3000 });
        } else {
            window.addEventListener('load', () => setTimeout(fn, 1500));
        }
    }

    function loadAdSenseScript() {
        if (window.adsbygoogle) return Promise.resolve();
        if (loadPromise) return loadPromise;
        loadPromise = new Promise((resolve) => {
            const s = document.createElement('script');
            s.async = true;
            s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.client}`;
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve();
            s.onerror = () => resolve();
            document.head.appendChild(s);
        });
        return loadPromise;
    }

    function slotForKey(key) {
        const id = cfg.units?.[key];
        return id && String(id).trim() ? String(id).trim() : null;
    }

    function collapseSlot(container) {
        container?.classList.add('ad-slot--collapsed');
    }

    function buildIns(slotId) {
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.setAttribute('data-ad-client', cfg.client);
        ins.setAttribute('data-ad-slot', slotId);
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');
        return ins;
    }

    function prepareContainers() {
        const usedSlots = new Set();
        const containers = document.querySelectorAll('[data-nexus-ad]');

        containers.forEach((container) => {
            if (container.querySelector('ins.adsbygoogle')) return;

            const slotId = slotForKey(container.dataset.nexusAd);
            if (!slotId) {
                collapseSlot(container);
                return;
            }

            if (usedSlots.has(slotId)) {
                collapseSlot(container);
                return;
            }

            usedSlots.add(slotId);
            container.appendChild(buildIns(slotId));
        });

        return document.querySelectorAll('ins.adsbygoogle');
    }

    function watchFill(container) {
        window.setTimeout(() => {
            const ins = container?.querySelector('ins.adsbygoogle');
            if (!ins || !container) return;
            const unfilled = ins.getAttribute('data-ad-status') === 'unfilled';
            const noFrame = !ins.querySelector('iframe');
            if (unfilled || noFrame) collapseSlot(container);
        }, 2500);
    }

    async function initAds() {
        if (LOCAL) {
            document.querySelectorAll('[data-nexus-ad], .ad-slot').forEach(collapseSlot);
            return;
        }

        const units = prepareContainers();
        if (!units.length) return;

        await loadAdSenseScript();
        if (typeof window.adsbygoogle === 'undefined') {
            document.querySelectorAll('[data-nexus-ad]').forEach(collapseSlot);
            return;
        }

        units.forEach((ins) => {
            const container = ins.closest('[data-nexus-ad], .ad-slot');
            try {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
                watchFill(container);
            } catch {
                collapseSlot(container);
            }
        });
    }

    window.__NEXUS_INIT_ADS = initAds;
    scheduleIdle(initAds, 3500);
})();
