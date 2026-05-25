#!/usr/bin/env node
/** Bake data-i18n / data-i18n-html / data-i18n-attr values into static HTML. */

function escapeAttr(val) {
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function t(dict, key) {
    const val = dict[key];
    return val == null || val === '' ? null : val;
}

function setAttrOnTag(tagOpen, attr, val) {
    const escaped = escapeAttr(val);
    if (new RegExp(`\\b${attr}="[^"]*"`).test(tagOpen)) {
        return tagOpen.replace(new RegExp(`\\b${attr}="[^"]*"`), `${attr}="${escaped}"`);
    }
    if (new RegExp(`\\b${attr}='[^']*'`).test(tagOpen)) {
        return tagOpen.replace(new RegExp(`\\b${attr}='[^']*'`), `${attr}="${escaped}"`);
    }
    return tagOpen.replace(/\/?>$/, ` ${attr}="${escaped}">`);
}

/** Replace inner HTML for elements with data-i18n-html. */
function applyI18nHtml(html, dict) {
    return html.replace(
        /<([a-z0-9-]+)([^>]*\bdata-i18n-html="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi,
        (match, tag, attrs, key, _inner) => {
            const val = t(dict, key);
            if (val == null) return match;
            return `<${tag}${attrs}>${val}</${tag}>`;
        }
    );
}

/** Set attribute named by data-i18n-attr from data-i18n key. */
function applyI18nAttr(html, dict) {
    return html.replace(/<([a-z0-9-]+)([^>]*\bdata-i18n="([^"]+)"[^>]*\bdata-i18n-attr="([^"]+)"[^>]*)\/?>/gi, (match, tag, attrs, key, attr) => {
        const val = t(dict, key);
        if (val == null) return match;
        const open = `<${tag}${attrs}>`;
        return setAttrOnTag(open, attr, val);
    }).replace(/<([a-z0-9-]+)([^>]*\bdata-i18n-attr="([^"]+)"[^>]*\bdata-i18n="([^"]+)"[^>]*)\/?>/gi, (match, tag, attrs, attr, key) => {
        const val = t(dict, key);
        if (val == null) return match;
        const open = `<${tag}${attrs}>`;
        return setAttrOnTag(open, attr, val);
    });
}

/** Replace plain text content for elements with data-i18n (no nested tags). */
function applyI18nText(html, dict) {
    return html.replace(
        /<([a-z0-9-]+)([^>]*\bdata-i18n="([^"]+)"(?![^>]*\bdata-i18n-html)(?![^>]*\bdata-i18n-attr)[^>]*)\/?>([^<]*)<\/\1>/gi,
        (match, tag, attrs, key, _text) => {
            const val = t(dict, key);
            if (val == null) return match;
            return `<${tag}${attrs}>${val}</${tag}>`;
        }
    );
}

function applyStaticI18n(html, dict) {
    let out = html;
    out = applyI18nHtml(out, dict);
    out = applyI18nAttr(out, dict);
    // Run text pass twice — some nested replacements may unlock parent-only nodes
    out = applyI18nText(out, dict);
    out = applyI18nText(out, dict);
    return out;
}

/** Point href at data-locale-href-ar for Arabic pages. */
function patchArGuideHrefs(html) {
    return html.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
        const arMatch = attrs.match(/\bdata-locale-href-ar="([^"]+)"/);
        if (!arMatch) return match;
        const arHref = arMatch[1];
        if (/\bhref="[^"]*"/.test(attrs)) {
            return `<a${attrs.replace(/\bhref="[^"]*"/, `href="${arHref}"`)}>`;
        }
        return `<a href="${arHref}"${attrs}>`;
    });
}

/** Bake SEO intro card copy from __NEXUS_I18N_SEO.ar (compress tool default). */
function applySeoIntro(html, seoCopy) {
    if (!seoCopy) return html;
    const byId = [
        ['seo-heading', seoCopy.h1],
        ['seo-intro-title-1', seoCopy.title1],
        ['seo-intro-1', seoCopy.intro1],
        ['seo-intro-title-2', seoCopy.title2],
        ['seo-intro-2', seoCopy.intro2],
        ['seo-intro-title-3', seoCopy.title3],
        ['seo-intro-3', seoCopy.intro3],
    ];
    let out = html;
    for (const [id, text] of byId) {
        if (!text) continue;
        out = out.replace(
            new RegExp(`(<[^>]+\\bid="${id}"[^>]*>)([\\s\\S]*?)(<\\/[^>]+>)`),
            `$1${text}$3`
        );
    }
    return out;
}

/** Arabic JSON-LD snippets for /ar/ page. */
function patchArSchema(html) {
    return html
        .replace(
            /"description": "Free online image compressor\. Reduce image file size instantly in your browser with no uploads\."/,
            '"description": "ضاغط صور مجاني على الإنترنت. تصغير حجم الصور فوراً في متصفحك بدون رفع."'
        )
        .replace(
            /"featureList": "JPEG PNG WebP AVIF compression, batch ZIP, local processing, no upload"/,
            '"featureList": "ضغط JPEG PNG WebP AVIF، دفعات ZIP، معالجة محلية، بدون رفع"'
        );
}

module.exports = {
    applyStaticI18n,
    patchArGuideHrefs,
    applySeoIntro,
    patchArSchema,
};
