(function () {
    const id = window.GTM_CONTAINER_ID;
    if (!id || typeof id !== 'string' || !id.startsWith('GTM-')) return;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
    document.head.appendChild(script);
})();
