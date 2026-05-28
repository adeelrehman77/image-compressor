# Google tags — permanent setup (Fun Adventure Media Studio)

This site uses **one** tracking system: **Google Tag Manager (GTM)**.  
You manage GA4, Google Ads, and future tags **inside GTM** — not in website code.

| What | ID | Where it lives |
|------|-----|----------------|
| **Tag Manager container** | `GTM-K59TSM95` | `public/js/ga-config.js` → `GTM_CONTAINER_ID` |
| **GA4 (Analytics)** | `G-C7MSE78KWN` | Tag inside GTM |
| **Google Ads** | `AW-668399104` | Tag inside GTM |
| **Website loader** | `gtm.js` + `ga-config.js` | All pages |

**Do not** paste Google's gtag snippets or a second GTM block into HTML. That causes double counting.

---

## One-time GTM setup (do this in Google's UI)

### 1. Open Tag Manager

1. Go to [tagmanager.google.com](https://tagmanager.google.com)
2. Open container **GTM-K59TSM95** (Fun Adventure / File Compress)

### 2. Add GA4 tag

1. **Tags** → **New**
2. Tag type: **Google Analytics: GA4 Configuration**
3. Measurement ID: **`G-C7MSE78KWN`**
4. Trigger: **All Pages**
5. Name: `GA4 - Configuration`
6. **Save**

### 3. Add Google Ads tag

1. **Tags** → **New**
2. Tag type: **Google Tag**
3. Tag ID: **`AW-668399104`**
4. Trigger: **All Pages**
5. Name: `Google Ads - AW-668399104`
6. **Save**

### 4. Publish

1. **Submit** (top right)
2. Version name e.g. `GA4 + Ads initial`
3. **Publish**

Without this publish step, the site loads GTM but **no data** reaches Analytics or Ads.

---

## Verify tracking works

1. Deploy the website (see [DEPLOY.md](./DEPLOY.md))
2. Visit **https://compress.funadventure.ae** (disable ad blockers)
3. **GA4** → Reports → **Realtime** — you should see yourself
4. **Tag Manager** → **Preview** — connect to your URL and confirm both tags fire
5. Optional: [Tag Assistant](https://tagassistant.google.com/)

Stream warning *"Data collection isn't active"* can take **24–48 hours** to clear even when Realtime works.

---

## What the website code does

- `ga-config.js` — stores `GTM-K59TSM95`
- `gtm.js` — loads GTM from Google (async)
- `<noscript>` iframe — fallback when JavaScript is off
- `guide-footer.js` — loads GTM on guides, privacy, terms, docs

**Removed on purpose:** direct `analytics.js` / gtag loader (avoids duplicate hits with GTM).

---

## Changing IDs later

| Change | Action |
|--------|--------|
| New GTM container | Update `GTM_CONTAINER_ID` in `ga-config.js`, redeploy |
| New GA4 property | Change tag in GTM UI, publish — **no code deploy** |
| New Google Ads account | Change tag in GTM UI, publish — **no code deploy** |
| New pixel (Meta, etc.) | Add tag in GTM UI, publish — **no code deploy** |

---

## Google Ads policy tip

Your tool is a **browser-based web app**, not downloadable software.

In ad copy use:

- ✅ "Free **online** compressor" / "**In your browser** — no install"
- ❌ "Free software" / "Download app" / "Install tool"

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CSP errors for `googletagmanager.com` | Deploy latest `public/_headers`; hard refresh / unregister service worker |
| GTM Preview debug badge CSS blocked | CSP `style-src` needs `googletagmanager.com` + `fonts.googleapis.com`; `font-src` needs `fonts.gstatic.com` |
| Tag Assistant blocked | CSP `connect-src` must include `googletagmanager.com` (already in repo) |
| CSP blocks `www.google.ae/pagead` or `csi.gstatic.com` | Deploy latest `public/_headers` (`connect-src` includes `google.ae`, `*.gstatic.com`) |
| Double page views | Remove any extra gtag/GTM snippets; use GTM only |
| Realtime = 0 | Publish GTM container; check ad blocker; confirm tags have **All Pages** trigger |
| GA stream still yellow | Wait 24–48h after first Realtime hits |

---

## Quick reference

```
Website → GTM-K59TSM95 → GA4 (G-C7MSE78KWN) + Ads (AW-668399104)
```

**Analytics (reports):** [analytics.google.com](https://analytics.google.com)  
**Ads (campaigns):** [ads.google.com](https://ads.google.com)  
**Tags (technical):** [tagmanager.google.com](https://tagmanager.google.com)
