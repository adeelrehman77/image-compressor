/** Shared tool copy — loaded synchronously in <head> for instant hash SEO. */
window.__NEXUS_TOOL_META = {
    taglines: {
        compress: 'Compress images in your browser',
        'images-to-pdf': 'Images to PDF — UAE portal ready',
        'pdf-suite': 'PDF merge & split — local only',
        svg: 'SVG optimizer for the web',
        'passport-studio': 'Passport & visa photos — ICAO ready',
    },
    titles: {
        compress: 'Free Online Image Compressor | NexusCompress',
        'images-to-pdf': 'Images to PDF — Free Online | NexusCompress',
        'pdf-suite': 'PDF Merge & Split — Free Online | NexusCompress',
        svg: 'SVG Optimizer — Free Online | NexusCompress',
        'passport-studio': 'Passport & Visa Photo Studio — Free Online | NexusCompress',
    },
    descriptions: {
        compress:
            'Free online image compressor. Reduce JPEG, PNG, WebP & AVIF file size instantly in your browser — no upload, 100% private. Batch compress & download.',
        'images-to-pdf':
            'Combine JPEG and PNG scans into one PDF for UAE portal uploads. Runs locally in your browser — private, free, no account.',
        'pdf-suite':
            'Merge multiple PDFs or split pages to ZIP in your browser. Free, private PDF tools — no uploads, no account.',
        svg: 'Optimize SVG vector files online. Strip metadata and bloat client-side — free, private, no install.',
        'passport-studio':
            'Create passport and visa photos for India Passport Seva, VFS, and UAE Emirates ID. Free, private, ICAO-ready exports.',
    },
    seo: {
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
    },
};

(function () {
    var VALID = { compress: 1, 'images-to-pdf': 1, 'pdf-suite': 1, svg: 1, 'passport-studio': 1 };

    function parseToolFromHash() {
        var h = (location.hash || '').replace(/^#/, '').trim();
        return VALID[h] ? h : 'compress';
    }

    function applyHeadMeta(tool) {
        var m = window.__NEXUS_TOOL_META;
        if (!m) return;
        var title = m.titles[tool];
        if (title) document.title = title;
        var desc = m.descriptions[tool];
        if (!desc) return;
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', desc);
        var ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', desc);
        var twDesc = document.querySelector('meta[name="twitter:description"]');
        if (twDesc) twDesc.setAttribute('content', desc);
        if (title) {
            var ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) ogTitle.setAttribute('content', title);
            var twTitle = document.querySelector('meta[name="twitter:title"]');
            if (twTitle) twTitle.setAttribute('content', title);
        }
    }

    function applyToolState(tool) {
        var m = window.__NEXUS_TOOL_META;
        if (!m) return;
        var resolved = VALID[tool] ? tool : 'compress';

        document.querySelectorAll('[data-tool-panel]').forEach(function (panel) {
            var active = panel.dataset.toolPanel === resolved;
            panel.classList.toggle('is-hidden', !active);
            panel.setAttribute('aria-hidden', active ? 'false' : 'true');
            panel.tabIndex = active ? 0 : -1;
        });
        document.querySelectorAll('.tool-nav-link').forEach(function (link) {
            var active = link.dataset.tool === resolved;
            link.classList.toggle('active', active);
            link.setAttribute('aria-selected', active ? 'true' : 'false');
            link.tabIndex = active ? 0 : -1;
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        var tag = document.getElementById('site-logo-tag');
        if (tag && m.taglines[resolved]) tag.textContent = m.taglines[resolved];

        applyHeadMeta(resolved);

        var copy = m.seo[resolved] || m.seo.compress;
        if (copy) {
            var set = function (id, text) {
                var el = document.getElementById(id);
                if (el && text != null) el.textContent = text;
            };
            set('seo-heading', copy.h1);
            set('seo-intro-title-1', copy.title1);
            set('seo-intro-1', copy.intro1);
            set('seo-intro-title-2', copy.title2);
            set('seo-intro-2', copy.intro2);
            set('seo-intro-title-3', copy.title3);
            set('seo-intro-3', copy.intro3);
            document.querySelectorAll('[data-seo-scope="compress"]').forEach(function (el) {
                el.classList.toggle('is-hidden', resolved !== 'compress');
            });
        }
        var belowApp = document.querySelector('.below-app');
        if (belowApp) belowApp.classList.toggle('is-hidden', resolved !== 'compress');
    }

    window.__NEXUS_TOOL_SHELL = {
        parseTool: parseToolFromHash,
        applyHeadMeta: applyHeadMeta,
        applyToolState: applyToolState,
    };

    applyHeadMeta(parseToolFromHash());
})();
