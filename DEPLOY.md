# Deploy NexusCompress to Cloudflare Pages

This project builds a static site into `dist/`. Cloudflare Pages serves that folder after each Git push.

## Prerequisites

- A [Cloudflare](https://dash.cloudflare.com) account
- This repository pushed to GitHub, GitLab, or Bitbucket

## One-time setup (Git integration)

1. **Push the repo** to your Git provider.

2. Cloudflare Dashboard → **Workers & Pages** → your project → **Settings** → **Build**.

3. Configure **exactly** these values:

   | Setting | Value |
   |---------|--------|
   | **Production branch** | `main` |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Root directory** | *(leave empty)* |
   | **Deploy command** | `npx wrangler deploy` *(if the UI marks it required)* |

4. **Save** and trigger a new deployment.

### Deploy command (required in newer Cloudflare UI)

If the dashboard shows **Deploy command: Required**, use:

```bash
npx wrangler deploy
```

This project’s `wrangler.toml` points Wrangler at `./dist` via `[assets]`. The build step must run first (`npm run build`) so `dist/` exists before deploy.

**Do not use** plain `wrangler deploy` without `wrangler.toml` assets config, or `npx wrangler versions upload` — those will fail.

If your UI also has **Build output directory**, set it to `dist`. Some flows only use Build + Deploy commands.

## Custom domain

After the first deploy: **Custom domains** → add your domain and follow DNS instructions.

Production URL: **https://compress.funadventure.ae**

## AdSense: ads.txt & Privacy Policy

| File | URL on this deploy |
|------|---------------------|
| `public/ads.txt` | https://compress.funadventure.ae/ads.txt |
| `public/privacy.html` | https://compress.funadventure.ae/privacy.html |

If Google AdSense is registered on the **root domain** `funadventure.ae`, you must also host the same `ads.txt` line at **https://funadventure.ae/ads.txt** (via your main site’s hosting — not automatic from this Worker).

**Google Analytics:** Edit `public/js/ga-config.js` and set `window.GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'` before deploy.

## Redirect workers.dev to custom domain

Avoid duplicate content in Google by redirecting the default Workers hostname to your custom domain.

1. Cloudflare Dashboard → **Rules** → **Redirect Rules** → **Create rule**
2. **Name:** `Workers to custom domain`
3. **When:** Custom filter expression:
   ```
   (http.host eq "image-compressor.adeelrehman77.workers.dev")
   ```
4. **Then:** Dynamic redirect → **URL** `concat("https://compress.funadventure.ae", http.request.uri.path)` → **Status** `301`
5. **Deploy**

Or use **Single redirect:** `https://image-compressor.adeelrehman77.workers.dev/*` → `https://compress.funadventure.ae/$1` (301).

## SEO & Google Search Console

See [SEO.md](./SEO.md). After deploy:

1. Add property `https://compress.funadventure.ae` in [Search Console](https://search.google.com/search-console)
2. Submit sitemap: `https://compress.funadventure.ae/sitemap.xml`
3. Request indexing for the homepage

## Local production preview

```bash
npm install
npm run build
npm run preview
```

Open the URL shown (default `http://localhost:3000`) — serves the `dist/` folder.

## Wrangler CLI (optional, manual deploy)

Only if you deploy from your machine, not via Git:

```bash
npm install
npm run pages:deploy
```

Or:

```bash
npm run build
npx wrangler pages deploy dist --project-name=nexuscompress
```

Use `wrangler pages deploy`, **not** `wrangler deploy`.

## Security headers

`public/_headers` is copied to `dist/_headers` and applied automatically on Cloudflare Pages.

## Notes

- **No server runtime** — compression is 100% client-side.
- **Service worker** caches the app shell for faster repeat visits.
- **Node version**: Pages uses Node 20 by default (`.node-version`); dev tools (Puppeteer) are devDependencies only.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `wrangler deploy` / Missing entry-point | Set deploy to `npx wrangler deploy` and ensure `wrangler.toml` has `[assets] directory = "./dist"`. |
| Deploy command **Required** | Use `npx wrangler deploy` (not `wrangler versions upload`). |
| Build fails on `postcss` | Run `npm run build` locally; commit `package-lock.json`. |
| Blank page | **Build output directory** must be `dist`, not `/`. |
| Old assets after deploy | Hard refresh; service worker updates on next visit. |
| `EBADENGINE` for Puppeteer | Harmless warning on Node 20; tests use Puppeteer locally only. |
