(function () {
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const theme = localStorage.getItem('nexus-theme') || 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;

    if (!document.getElementById('site-compliance-footer')) {
        const footer = document.createElement('footer');
        footer.id = 'site-compliance-footer';
        footer.className = 'site-compliance-footer max-width-wrap';
        footer.innerHTML = `
            <nav class="site-compliance-nav" aria-label="Legal and support">
                <a href="${resolvePath('privacy.html')}">Privacy Policy</a>
                <a href="${resolvePath('terms.html')}">Terms of Service</a>
                <a href="mailto:info@funadventure.ae">Contact Support</a>
            </nav>`;
        document.body.appendChild(footer);
    }

    function resolvePath(file) {
        const path = location.pathname || '/';
        if (path.includes('/guides/')) return `../${file}`;
        return file;
    }

    function jsPath(file) {
        const path = location.pathname || '/';
        if (path.includes('/guides/')) return `../js/${file}`;
        return `js/${file}`;
    }

    function injectAnalytics() {
        if (document.querySelector('script[src*="ga-config.js"]')) return;
        ['ga-config.js', 'analytics.js'].forEach((file) => {
            const s = document.createElement('script');
            s.src = jsPath(file);
            s.defer = true;
            document.body.appendChild(s);
        });
    }

    injectAnalytics();
})();
