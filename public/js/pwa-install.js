(function () {
    'use strict';

    const DISMISS_KEY  = 'nexus-pwa-dismissed';
    const DISMISS_DAYS = 7;

    let deferredPrompt = null;
    let shown = false;

    function isDismissed() {
        const ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
        if (!ts) return false;
        return (Date.now() - ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    }

    function showBanner() {
        if (shown || !deferredPrompt || isDismissed()) return;
        shown = true;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.classList.remove('is-hidden');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // Show after 30 seconds if user hasn't compressed anything yet
        setTimeout(showBanner, 30000);
    });

    // Also expose so app.js can call it after first compression
    window.__nexusShowPwaPrompt = showBanner;

    window.addEventListener('DOMContentLoaded', () => {
        const banner     = document.getElementById('pwa-install-banner');
        const installBtn = document.getElementById('pwa-install-btn');
        const dismissBtn = document.getElementById('pwa-dismiss-btn');
        if (!banner) return;

        installBtn?.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            try {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                banner.classList.add('is-hidden');
                if (outcome === 'accepted') localStorage.removeItem(DISMISS_KEY);
            } catch (err) {
                banner.classList.add('is-hidden');
            }
        });

        dismissBtn?.addEventListener('click', () => {
            banner.classList.add('is-hidden');
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        });
    });
})();
