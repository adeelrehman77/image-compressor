# Google tags — permanent setup (Fun Adventure Media Studio)

This site uses **one** tracking system: **Google Tag Manager (GTM)**.  
You manage GA4, Google Ads, and future tags **inside GTM** — not in website code.

| What | ID | Where it lives |
|------|-----|----------------|
| **Tag Manager container** | `GTM-K59TSM95` | `public/js/ga-config.js` → `GTM_CONTAINER_ID` |
| **GA4 (Analytics)** | `G-C7MSE78KWN` | Tag inside GTM |
| **Google Ads (legacy / Fun Adventure — paused)** | `AW-668399104` | Do **not** re-enable on compress |
| **Google Ads account** | Nexus Compress (`ocid=8466653436`) | Campaign removed 2026-08-10 (no spend) |
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

### 3. Google Ads — do **not** add Fun Adventure Ads ID

**Blocked on this container:** `AW-668399104`  
That Google tag is linked to Fun Adventure GA4 (`G-F6BE6DN4D4`) and re-leaks compress pageviews into the play-area property.

For NexusCompress Ads conversions:

1. Keep only **`Google Tag G-C7MSE78KWN`** (+ event tags) active in this GTM
2. In Google Ads (Nexus Compress), link GA4 **`G-C7MSE78KWN`** and import conversions (e.g. `tool_conversion`)
3. Do **not** re-add `AW-668399104` (or any Google tag linked to `G-F6BE6DN4D4`)

### 4. Publish

1. **Submit** (top right)
2. Version name e.g. `GA4 only — no Fun Adventure Ads tag`
3. **Publish**

Without this publish step, the site loads GTM but **no data** reaches Analytics.

---

## Verify tracking works

1. Deploy the website (see [DEPLOY.md](./DEPLOY.md))
2. Visit **https://compress.funadventure.ae** (disable ad blockers)
3. **GA4** → Reports → **Realtime** — you should see yourself
4. **Tag Manager** → **Preview** — connect to your URL and confirm **only** `Google Tag G-C7MSE78KWN` (+ GA4 events) fire — **not** `AW-668399104` / Fun Adventure tags
5. Optional: [Tag Assistant](https://tagassistant.google.com/)
6. Network check: collect hits should show `tid=G-C7MSE78KWN` only (no `G-F6BE6DN4D4`)

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

## CRITICAL — Do not send hits to Fun Adventure GA4

**Wrong measurement ID (play-area site):** `G-F6BE6DN4D4`  
**Correct measurement ID (NexusCompress):** `G-C7MSE78KWN`

### Root cause (fixed 2026-08-10)

There was **no** explicit `G-F6BE6DN4D4` tag in this container. Leak path:

1. Ads tags used conversion ID **`AW-668399104`**
2. That ID belongs to Google tag **“Fun Adventure”**, which also includes **`G-F6BE6DN4D4`**
3. GTM message: *“This tag will use the configuration of Google tag Fun Adventure…”*
4. So every compress pageview also hit Fun Adventure GA4

### Fix in GTM-K59TSM95

**Removed** (2026-08-10 — preferred over pause):

- `Google Ads - AW-668399104` (Google Tag)
- `Media Studio Download` / `Google Ads - Media Studio Download` (Ads conversions)

Keep active:

- **`Google Tag G-C7MSE78KWN`**
- **`GA4 - tool_conversion`** (event)
- Optional: `Google Ads - Conversion Linker` (no Fun Adventure GA4 leak; safe to keep or remove)

Verified: compress Network shows `tid=G-C7MSE78KWN` only — **no** `tid=G-F6BE6DN4D4`.

If GTM shows *“One missing Google tag found”* → **Dismiss**, do **not** click **Fix** (that can re-add a linked Ads/Fun Adventure Google tag).

### Do not reintroduce the leak

- Do **not** add Ads tags that use **`AW-668399104`** on compress (that Google tag is linked to Fun Adventure GA4).
- On Ads signup “measure conversions” screens: do **not** “install / use Google tag found on website” into `GTM-K59TSM95` if it would pull Fun Adventure’s Google tag.
- Preferred conversions path: link Ads account **Nexus Compress** → GA4 **`G-C7MSE78KWN`**, then import `tool_conversion` (and other key events). No Ads Google tag required on the site for that.
- Optional belt-and-suspenders in Fun Adventure GA4: hostname include filter for `funadventure.ae` / `www` only.

### Search campaign (cancelled 2026-08-10)

- Account: **Nexus Compress** was created; Search campaign was **removed** the same day (user request — no ad spend; AED 50 card hold cancelled in Ads billing).
- Do not relaunch Ads without explicit approval.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Fun Adventure GA shows NexusCompress pages | Remove `G-F6BE6DN4D4` from GTM-K59TSM95 (see CRITICAL above) |
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
Website → GTM-K59TSM95 → GA4 (G-C7MSE78KWN only)
Ads (Nexus Compress) → import conversions from GA4 G-C7MSE78KWN
(Do not put AW-668399104 back in this GTM container)
```

**Analytics (reports):** [analytics.google.com](https://analytics.google.com)  
**Ads (campaigns):** [ads.google.com](https://ads.google.com)  
**Tags (technical):** [tagmanager.google.com](https://tagmanager.google.com)
