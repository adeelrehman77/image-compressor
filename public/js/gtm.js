(function () {
    const FALLBACK_ID = 'GTM-K59TSM95';

    function bootstrap() {
        if (window.__gtmBootstrapped) return;

        const id = window.GTM_CONTAINER_ID || FALLBACK_ID;
        if (typeof id !== 'string' || !id.startsWith('GTM-')) return;

        window.__gtmBootstrapped = true;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
        document.head.appendChild(script);
    }

    bootstrap();
})();
