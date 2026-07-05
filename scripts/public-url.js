/**
 * Extensionless public URLs for Cloudflare Pages (clean URLs strip .html).
 * Physical files remain *.html on disk; only referenced URLs drop the suffix.
 */
const path = require('path');
const { siteUrl } = require('./site-config');

const SITE = siteUrl.replace(/\/$/, '');

/** Sitemap / canonical path → source file under public/ */
function locToSourceFile(loc, publicDir) {
    if (loc === '/') return path.join(publicDir, 'index.html');
    if (loc === '/ar/') return path.join(publicDir, 'index.html');
    if (loc === '/guides/') return path.join(publicDir, 'guides/index.html');
    return path.join(publicDir, `${loc.slice(1)}.html`);
}

/** Absolute canonical URL from a sitemap loc (extensionless). */
function locToAbsoluteUrl(loc) {
    return `${SITE}${loc}`;
}

/** Strip .html from compress.funadventure.ae absolute URLs. */
function stripHtmlFromAbsoluteUrl(url) {
    if (!url.startsWith(SITE)) return url;
    const p = url.slice(SITE.length);
    if (p === '/guides/index.html') return `${SITE}/guides/`;
    if (p.endsWith('.html')) return SITE + p.slice(0, -5);
    return url;
}

/** Strip .html from a relative href (preserves external/special URLs). */
function stripHtmlFromHref(href) {
    if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.includes('googletagmanager')
    ) {
        return href;
    }
    if (href === 'index.html') return './';
    if (href.endsWith('/index.html')) return `${href.slice(0, -11)}/`;
    if (href.endsWith('.html')) return href.slice(0, -5);
    return href;
}

/** Rewrite HTML content: canonicals, hreflang, og:url, JSON-LD, internal hrefs. */
function stripHtmlUrlsInHtml(html) {
    let out = html;

    // Absolute URLs — guides index before general .html strip
    out = out.replace(/https:\/\/compress\.funadventure\.ae\/guides\/index\.html/g, `${SITE}/guides/`);
    out = out.replace(/https:\/\/compress\.funadventure\.ae\/[^"'\s>]+\.html/g, (m) =>
        stripHtmlFromAbsoluteUrl(m)
    );

    // Relative href / data-locale-href attributes
    out = out.replace(/(href|data-locale-href-en|data-locale-href-ar)="([^"]+)"/g, (m, attr, val) => {
        const next = stripHtmlFromHref(val);
        return next === val ? m : `${attr}="${next}"`;
    });

    return out;
}

module.exports = {
    locToSourceFile,
    locToAbsoluteUrl,
    stripHtmlFromAbsoluteUrl,
    stripHtmlFromHref,
    stripHtmlUrlsInHtml,
};
