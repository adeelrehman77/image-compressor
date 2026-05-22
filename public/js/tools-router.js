(function () {
    const TAGLINES = {
        compress: 'Compress images in your browser',
        'images-to-pdf': 'Images to PDF — UAE portal ready',
        'pdf-suite': 'PDF merge & split — local only',
        svg: 'SVG optimizer for the web',
        'passport-studio': 'Passport & visa photos — ICAO ready',
    };

    const TITLES = {
        compress: 'Free Online Image Compressor | NexusCompress',
        'images-to-pdf': 'Images to PDF — Free Online | NexusCompress',
        'pdf-suite': 'PDF Merge & Split — Free Online | NexusCompress',
        svg: 'SVG Optimizer — Free Online | NexusCompress',
        'passport-studio': 'Passport & Visa Photo Studio — Free Online | NexusCompress',
    };

    const SEO = {
        compress: {
            h1: 'Free Online Image Compressor — Reduce Image Size Instantly',
            title1: 'Shrink files in seconds',
            intro1:
                'NexusCompress is a free online image compressor that shrinks JPEG, PNG, WebP, and AVIF files without sending them to a cloud server. Drag and drop photos, adjust quality and dimensions, then download optimized images in seconds — perfect for websites, email attachments, and social media.',
            title2: 'Nothing leaves your device',
            intro2:
                'Unlike traditional compressors that upload your files, everything runs locally in your browser thread. That means faster processing, stronger privacy, and no risk of personal or client images sitting on a third-party server.',
            title3: 'Ready for real workflows',
            intro3:
                'Batch compress, set UAE portal size targets, compare before/after, and export as ZIP — all without creating an account or installing software.',
        },
        'images-to-pdf': {
            h1: 'Convert JPEGs and PNGs to PDF Online (Free & Private)',
            title1: 'One PDF from many scans',
            intro1:
                'Combine Emirates ID scans, tenancy contracts, passport copies, and other JPEG or PNG files into one clean PDF for MOHRE, ICA, RTA, and Dubai Municipality uploads — without sending documents to a cloud server.',
            title2: 'Order pages your way',
            intro2:
                'Drag images in the order you need, choose A4 or fit-to-page sizing, and download a single PDF in seconds. Processing runs entirely in your browser so sensitive paperwork stays on your device.',
            title3: 'Built for UAE portals',
            intro3:
                'Ideal when a government form asks for one combined file instead of separate photos — fast, free, and private for visa, labour, and municipality submissions.',
        },
        'pdf-suite': {
            h1: 'Merge or Split PDF Files Instantly in Your Browser',
            title1: 'Merge without uploads',
            intro1:
                'Join multiple PDF bank statements, contracts, or visa packets into one file, or split a large PDF into separate pages — free, fast, and private with no account required.',
            title2: 'Split pages to ZIP',
            intro2:
                'Select your PDFs, merge in order or extract every page to a ZIP, and download immediately. Files are never uploaded; merge and split run locally so confidential documents remain on your computer.',
            title3: 'No cloud lock-in',
            intro3:
                'Clean up statements, contracts, and application packs in minutes — no desktop app, no subscription, and no files stored on our servers.',
        },
        svg: {
            h1: 'Slightly Compress and Optimize SVG Vector Files Online',
            title1: 'Leaner vector files',
            intro1:
                'Strip editor metadata, hidden layers, and redundant markup from SVG icons and illustrations so your site loads faster — without installing desktop software.',
            title2: 'Preview before download',
            intro2:
                'Upload or paste an SVG, preview the leaner output, and download the optimized file in one click. All optimization happens client-side in your browser for speed and privacy.',
            title3: 'Made for developers',
            intro3:
                'Ship smaller icons, logos, and UI assets to production with a tool that fits right into your design-to-code workflow — no CLI required.',
        },
        'passport-studio': {
            h1: 'Create Official Passport and Visa Photos Online (Free & Private)',
            title1: 'India & UAE government formats',
            intro1:
                'Format portrait photos for Passport Seva Digital (630×810 px), OCI and e-Visa VFS print sheets (2×2 in / 51×51 mm), and UAE Emirates ID and visa portals (35×45 mm) — without uploading your biometrics to a cloud server.',
            title2: 'VFS, OCI, and smart-portal ready',
            intro2:
                'See ICAO and UAE-specific compliance tips as you pick a preset: white backgrounds, clothing contrast, file-size caps, and dimensions trusted for VFS Global appointments, OCI uploads, MOHRE, ICP, and Dubai Municipality turnstiles.',
            title3: 'Private by design',
            intro3:
                'Your passport and visa photos stay on your device. Crop, check warnings, and export portal-ready JPEGs locally — free, with no account and no server-side storage of identity documents.',
        },
    };

    function parseTool() {
        const hash = (location.hash || '').replace(/^#/, '').trim();
        if (hash === 'images-to-pdf' || hash === 'pdf-suite' || hash === 'svg' || hash === 'passport-studio') {
            return hash;
        }
        return 'compress';
    }

    function updateSeoContent(tool) {
        const copy = SEO[tool] || SEO.compress;
        const set = (id, text) => {
            const el = document.getElementById(id);
            if (el && text != null) el.textContent = text;
        };
        set('seo-heading', copy.h1);
        set('seo-intro-title-1', copy.title1);
        set('seo-intro-1', copy.intro1);
        set('seo-intro-title-2', copy.title2);
        set('seo-intro-2', copy.intro2);
        set('seo-intro-title-3', copy.title3);
        set('seo-intro-3', copy.intro3);
        document.querySelectorAll('[data-seo-scope="compress"]').forEach((el) => {
            el.classList.toggle('is-hidden', tool !== 'compress');
        });
    }

    function setTool(id) {
        const tool = TAGLINES[id] ? id : 'compress';
        document.querySelectorAll('[data-tool-panel]').forEach((panel) => {
            panel.classList.toggle('is-hidden', panel.dataset.toolPanel !== tool);
        });
        document.querySelectorAll('.tool-nav-link').forEach((link) => {
            const active = link.dataset.tool === tool;
            link.classList.toggle('active', active);
            link.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const tag = document.getElementById('site-logo-tag');
        if (tag) tag.textContent = TAGLINES[tool];
        if (TITLES[tool]) document.title = TITLES[tool];
        updateSeoContent(tool);
        window.NexusSentry?.setTool(tool);
        if (tool !== 'compress') {
            window.NexusTools?.ensureTool?.(tool).catch(() => {});
        }
        if (tool === 'images-to-pdf' || tool === 'pdf-suite') {
            window.NexusTools?.loadPdfLib?.().catch(() => {});
        }
        if (tool === 'compress' && !location.hash) {
            history.replaceState(null, '', location.pathname + location.search);
        }
    }

    function onNavClick(e) {
        const link = e.target.closest('.tool-nav-link');
        if (!link) return;
        e.preventDefault();
        const tool = link.dataset.tool || 'compress';
        if (tool === 'compress') {
            location.hash = '';
        } else {
            location.hash = tool;
        }
        setTool(tool);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelector('.site-header-tools')?.addEventListener('click', onNavClick);
        document.querySelector('.seo-tool-chips')?.addEventListener('click', (e) => {
            const chip = e.target.closest('a[href^="#"]');
            if (!chip) return;
            const hash = chip.getAttribute('href')?.replace(/^#/, '').trim();
            if (hash && TAGLINES[hash]) {
                e.preventDefault();
                location.hash = hash;
                setTool(hash);
            }
        });
        document.querySelector('[data-tool-home]')?.addEventListener('click', (e) => {
            if (location.pathname.endsWith('index.html') || location.pathname.endsWith('/')) {
                e.preventDefault();
                location.hash = '';
                setTool('compress');
            }
        });
        setTool(parseTool());
    });

    window.addEventListener('hashchange', () => setTool(parseTool()));
})();
