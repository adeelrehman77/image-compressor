/**
 * FAQ structured-data policy for NexusCompress.
 *
 * Hash routes (#photo-checker, #redactor, …) share one document URL with / and /ar/.
 * Google indexes a single HTML response — multiple FAQPage blocks (head + panels) cause
 * Search Console "Duplicate field FAQPage" errors.
 *
 * Rules:
 * - index.html and ar/index.html: WebSite + WebApplication only (no FAQPage, no Question JSON-LD).
 * - Each tool or product FAQ: exactly one FAQPage on a dedicated /guides/*.html URL.
 * - Tool panels: visible FAQ copy only; link to the guide for JSON-LD.
 */
const fs = require('fs');

const FAQ_PAGE_RE = /"@type"\s*:\s*"FAQPage"/g;
const QUESTION_JSON_LD_RE = /"@type"\s*:\s*"Question"/g;

/** SPA hash tools that must use dedicated guide URLs for FAQPage schema. */
const HASH_TOOLS_WITH_FAQ_GUIDES = [
    'photo-checker',
    'redactor',
    'ai-upscaler',
];

const DEDICATED_FAQ_GUIDES = [
    'guides/nexuscompress-image-compressor-faq.html',
    'guides/uae-photo-compliance-checker.html',
    'guides/redact-emirates-id-documents.html',
    'guides/ai-image-upscaler-browser.html',
];

function countFaqPage(html) {
    return (html.match(FAQ_PAGE_RE) || []).length;
}

function countQuestionJsonLd(html) {
    return (html.match(QUESTION_JSON_LD_RE) || []).length;
}

/**
 * @param {string} html
 * @param {string} label e.g. dist/index.html
 */
function assertHashDocumentHasNoFaqSchema(html, label) {
    const faq = countFaqPage(html);
    if (faq !== 0) {
        throw new Error(
            `${label}: hash SPA document must have zero FAQPage JSON-LD (found ${faq}). Move FAQ to /guides/*.html`
        );
    }
    const questions = countQuestionJsonLd(html);
    if (questions !== 0) {
        throw new Error(
            `${label}: hash SPA document must not embed Question JSON-LD (found ${questions}). Use a dedicated guide URL.`
        );
    }
}

/**
 * Tool panels are still in the same document as hash routes — forbid FAQ schema inside them.
 * @param {string} html
 * @param {string} label
 */
function assertToolPanelsHaveNoFaqSchema(html, label) {
    const panelRe = /id="tool-panel-([^"]+)"/g;
    let match;
    while ((match = panelRe.exec(html)) !== null) {
        const toolId = match[1];
        const start = match.index;
        const next = html.indexOf('id="tool-panel-', start + 16);
        const end = next === -1 ? html.length : next;
        const chunk = html.slice(start, end);
        if (countFaqPage(chunk) > 0) {
            throw new Error(`${label}: tool-panel-${toolId} must not contain FAQPage JSON-LD`);
        }
        if (countQuestionJsonLd(chunk) > 0) {
            throw new Error(`${label}: tool-panel-${toolId} must not contain Question JSON-LD`);
        }
        if (/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(chunk)) {
            throw new Error(`${label}: tool-panel-${toolId} must not contain application/ld+json scripts`);
        }
    }
}

function readHtml(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
    FAQ_PAGE_RE,
    HASH_TOOLS_WITH_FAQ_GUIDES,
    DEDICATED_FAQ_GUIDES,
    countFaqPage,
    countQuestionJsonLd,
    assertHashDocumentHasNoFaqSchema,
    assertToolPanelsHaveNoFaqSchema,
};
