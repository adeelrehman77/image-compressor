# SEO checklist — compress.funadventure.ae

## Implemented on-site

- [x] SEO title and meta description
- [x] Canonical URL (`https://compress.funadventure.ae/`)
- [x] Open Graph + Twitter Card + **og:image** (1200×630)
- [x] H1 and crawlable body copy (intro + FAQ)
- [x] FAQ accordion with long-tail keywords
- [x] FAQPage + WebApplication + WebSite JSON-LD
- [x] `robots.txt` and auto-generated `sitemap.xml` (7 URLs)
- [x] **4 guide pages** + guides index (internal links from homepage)
- [x] Mobile-friendly viewport
- [x] HTTPS custom domain
- [x] CSS preload on homepage

## AdSense requirements

- [x] **Privacy Policy** — https://compress.funadventure.ae/privacy.html (linked in footer)
- [x] **ads.txt** — https://compress.funadventure.ae/ads.txt  
  If AdSense uses root domain, also publish at https://funadventure.ae/ads.txt
- [ ] **GA4** — Set `G-XXXXXXXXXX` in `public/js/ga-config.js`

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
