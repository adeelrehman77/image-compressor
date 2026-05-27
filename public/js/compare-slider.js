/**
 * Shared before/after compare slider — used by compressor preview, modal, and AI upscaler.
 */
(function () {
    function setupCompareSlider(container, overlay, handle, overlayImg) {
        if (!container || !overlay || !handle || !overlayImg) return () => {};

        let pct = 50;
        const setPct = (p) => {
            pct = Math.max(0, Math.min(100, p));
            overlay.style.width = `${pct}%`;
            handle.style.left = `${pct}%`;
            container.setAttribute('aria-valuenow', String(Math.round(pct)));
        };

        const syncImageSize = () => {
            const w = container.getBoundingClientRect().width;
            overlayImg.style.width = `${w}px`;
            overlayImg.style.height = '100%';
        };

        const onOverlayImgLoad = () => syncImageSize();
        overlayImg.addEventListener('load', onOverlayImgLoad);
        window.addEventListener('resize', syncImageSize);
        syncImageSize();
        setPct(50);

        const pointerX = (e) => {
            const rect = container.getBoundingClientRect();
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            setPct((x / rect.width) * 100);
        };

        let sliding = false;

        const startSlide = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            sliding = true;
            pointerX(e);
        };

        const endSlide = () => {
            sliding = false;
        };

        const onMouseMove = (e) => {
            if (sliding) pointerX(e);
        };

        const onTouchMove = (e) => {
            if (!sliding) return;
            e.preventDefault();
            pointerX(e);
        };

        const onKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setPct(pct - 5);
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setPct(pct + 5);
            }
            if (e.key === 'Home') {
                e.preventDefault();
                setPct(0);
            }
            if (e.key === 'End') {
                e.preventDefault();
                setPct(100);
            }
        };

        container.addEventListener('mousedown', startSlide);
        container.addEventListener('touchstart', startSlide, { passive: true });
        window.addEventListener('mouseup', endSlide);
        window.addEventListener('touchend', endSlide);
        window.addEventListener('touchcancel', endSlide);
        window.addEventListener('mousemove', onMouseMove);
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('keydown', onKeyDown);

        return () => {
            overlayImg.removeEventListener('load', onOverlayImgLoad);
            window.removeEventListener('resize', syncImageSize);
            container.removeEventListener('mousedown', startSlide);
            container.removeEventListener('touchstart', startSlide);
            window.removeEventListener('mouseup', endSlide);
            window.removeEventListener('touchend', endSlide);
            window.removeEventListener('touchcancel', endSlide);
            window.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('keydown', onKeyDown);
        };
    }

    window.NexusCompareSlider = { setup: setupCompareSlider };
})();
