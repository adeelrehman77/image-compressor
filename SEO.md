# SEO checklist — compress.funadventure.ae

## Implemented on-site

- [x] SEO title and meta description
- [x] Canonical URL (`https://compress.funadventure.ae/`)
- [x] Open Graph + Twitter Card + **og:image** (1200×630)
- [x] H1 and crawlable body copy (intro + FAQ)
- [x] FAQ accordion with long-tail keywords
- [x] WebApplication + WebSite JSON-LD on `/` and `/ar/` (no `FAQPage` — hash routes share one URL)
- [x] FAQPage JSON-LD only on dedicated `/guides/*-faq.html` URLs (one per page; enforced by `scripts/seo-faq-policy.js` + `verify-dist.js`)
- [x] `robots.txt` and auto-generated `sitemap.xml` (7 URLs)
- [x] **4 guide pages** + guides index (internal links from homepage)
- [x] Mobile-friendly viewport
- [x] HTTPS custom domain
- [x] CSS preload on homepage

## AdSense monetization

- [x] **ads.txt** — https://compress.funadventure.ae/ads.txt
- [x] **Privacy Policy** — AdSense disclosure in `privacy.html`
- [x] **Shared loader** — `public/js/ads-config.js` + `public/js/ads.js`
- [x] **Homepage** — ad below all studio tools (every tab) + optional in-content slot before FAQ
- [x] **Guides & docs** — ad injected via `guide-footer.js`
- [ ] **Second homepage unit** — create a display ad unit in AdSense, set `units.inContent` in `ads-config.js`
- [ ] **GA4** — Set `G-XXXXXXXXXX` in `public/js/ga-config.js`

## AdSense requirements (legacy checklist)

## Your action items (Google & Cloudflare)

1. **Google Search Console** — Add property `https://compress.funadventure.ae`
2. **Verify ownership** — HTML tag method: paste the meta tag Search Console gives you into `public/index.html` (see comment in `<head>`), deploy, then verify
3. **Submit sitemap** — `https://compress.funadventure.ae/sitemap.xml`
4. **Request indexing** — URL inspection → homepage → Request indexing
5. **Redirect workers.dev** — [DEPLOY.md](./DEPLOY.md#redirect-workersdev-to-custom-domain) (301 to custom domain)
6. **Google AdSense** — Site URL must be `compress.funadventure.ae`

## Sitemap URLs

| URL | Purpose |
|-----|---------|
| `/` | Main compressor |
| `/docs.html` | Documentation |
| `/guides/` | Guides hub |
| `/guides/compress-jpeg-without-losing-quality.html` | Long-tail |
| `/guides/jpeg-vs-webp.html` | Long-tail |
| `/guides/avif-vs-webp.html` | Long-tail |
| `/guides/resize-images-for-instagram.html` | Long-tail |

## Ranking expectations

**Technical + content SEO: strong for a single-product site.** You now have enough crawlable pages for long-tail queries. Head terms still need time, backlinks, and Search Console indexing.

**Overall:** ~8.5/10 on-page · ~3/10 off-page (until you build links)
