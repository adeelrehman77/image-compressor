(function () {
    function collectTagIds() {
        const ids = [];
        const adsId = window.GOOGLE_ADS_ID;
        const gaId = window.GA_MEASUREMENT_ID;
        if (typeof adsId === 'string' && adsId.startsWith('AW-')) ids.push(adsId);
        if (typeof gaId === 'string' && gaId.startsWith('G-')) ids.push(gaId);
        return ids;
    }

    function run() {
        const ids = collectTagIds();
        if (!ids.length) return;

        window.dataLayer = window.dataLayer || [];
        function gtag() {
            window.dataLayer.push(arguments);
        }
        window.gtag = gtag;
        gtag('js', new Date());

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${ids[0]}`;
        document.head.appendChild(script);

        ids.forEach((id) => {
            if (id.startsWith('G-')) {
                gtag('config', id, { anonymize_ip: true });
            } else {
                gtag('config', id);
            }
        });
    }

    run();
})();
