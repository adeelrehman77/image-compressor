(function () {
    function run() {
        const id = window.GA_MEASUREMENT_ID;
        if (!id || typeof id !== 'string' || !id.startsWith('G-')) return;

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        function gtag() {
            window.dataLayer.push(arguments);
        }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', id, { anonymize_ip: true });
    }

    if ('requestIdleCallback' in window) {
        requestIdleCallback(run, { timeout: 5000 });
    } else {
        window.addEventListener('load', () => setTimeout(run, 2000));
    }
})();
