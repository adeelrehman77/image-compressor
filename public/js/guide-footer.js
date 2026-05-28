(function () {
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const theme = localStorage.getItem('nexus-theme') || 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;

    function injectExtrasCSS() {
        if (document.querySelector('link[data-nexus-extras]')) return;
        const path = location.pathname || '/';
        const prefix = path.includes('/guides/') || path.includes('/ar/') ? '../' : '';
        const tokens = document.createElement('link');
        tokens.rel = 'stylesheet';
        tokens.href = `${prefix}css/tokens.css?v=2.2.9`;
        tokens.dataset.nexusTokens = '1';
        document.head.appendChild(tokens);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${prefix}css/nexus-extras.css?v=2.2.16`;
        link.dataset.nexusExtras = '1';
        document.head.appendChild(link);
    }
    injectExtrasCSS();

    function injectThemeToggle() {
        const meta = document.querySelector('.site-header-meta');
        if (!meta || meta.querySelector('.guide-theme-toggle')) return;
        const isDark = document.documentElement.classList.contains('dark');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'guide-theme-toggle';
        btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        btn.setAttribute('aria-pressed', String(isDark));
        btn.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
        btn.innerHTML = `
            <svg class="theme-icon theme-icon-sun icon-sm${isDark ? '' : ' is-hidden'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" stroke-width="2"/>
                <path stroke-linecap="round" stroke-width="2" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
            <svg class="theme-icon theme-icon-moon icon-sm${isDark ? ' is-hidden' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>`;
        btn.addEventListener('click', () => {
            const nowDark = document.documentElement.classList.toggle('dark');
            document.documentElement.dataset.theme = nowDark ? 'dark' : 'light';
            localStorage.setItem('nexus-theme', nowDark ? 'dark' : 'light');
            btn.setAttribute('aria-pressed', String(nowDark));
            btn.setAttribute('aria-label', nowDark ? 'Switch to light theme' : 'Switch to dark theme');
            btn.title = nowDark ? 'Switch to light theme' : 'Switch to dark theme';
            btn.querySelector('.theme-icon-sun')?.classList.toggle('is-hidden', !nowDark);
            btn.querySelector('.theme-icon-moon')?.classList.toggle('is-hidden', nowDark);
        });
        meta.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectThemeToggle);
    } else {
        injectThemeToggle();
    }

    if (!document.getElementById('site-compliance-footer')) {
        const footer = document.createElement('footer');
        footer.id = 'site-compliance-footer';
        footer.className = 'site-compliance-footer max-width-wrap';
        footer.innerHTML = `
            <nav class="site-compliance-nav" aria-label="Legal and support">
                <a href="${resolvePath('privacy.html')}">Privacy Policy</a>
                <a href="${resolvePath('terms.html')}">Terms of Service</a>
                <a href="${resolvePath('contact.html')}">Contact Support</a>
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

    function injectGtm() {
        if (document.querySelector('script[src*="gtm.js"]')) return;
        ['ga-config.js', 'gtm.js'].forEach((file) => {
            const s = document.createElement('script');
            s.src = jsPath(file);
            s.defer = true;
            document.body.appendChild(s);
        });
    }

    function injectContentAd() {
        if (document.querySelector('[data-nexus-ad]')) return;

        const article = document.querySelector('.guide-page, .docs-page');
        if (!article) return;

        const ad = document.createElement('aside');
        ad.className = 'ad-slot ad-slot--primary glass-panel max-width-wrap';
        ad.dataset.nexusAd = 'primary';
        ad.setAttribute('aria-label', 'Advertisement');

        const footer = document.querySelector('.site-footer');
        if (footer) footer.before(ad);
        else article.after(ad);
    }

    function loadAds() {
        if (document.querySelector('script[src*="ads.js"]')) return;

        const config = document.createElement('script');
        config.src = jsPath('ads-config.js');
        document.body.appendChild(config);

        config.addEventListener('load', () => {
            const ads = document.createElement('script');
            ads.src = jsPath('ads.js');
            ads.defer = true;
            document.body.appendChild(ads);
        });
    }

    injectGtm();
    injectContentAd();
    loadAds();
})();
