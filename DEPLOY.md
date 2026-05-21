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
   | **Deploy command** | *(leave **empty**)* |

4. **Save** and trigger a new deployment.

### Important: leave Deploy command empty

If you set **Deploy command** to `npx wrangler deploy`, the build will succeed but deploy will fail with:

```text
Missing entry-point to Worker script or to assets directory
```

That command is for **Cloudflare Workers**, not static Pages. Pages already uploads `dist/` after `npm run build` — no extra deploy step is needed.

## Custom domain

After the first deploy: **Custom domains** → add your domain and follow DNS instructions.

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
| `wrangler deploy` / Missing entry-point | **Clear the Deploy command** in Pages build settings. |
| Build fails on `postcss` | Run `npm run build` locally; commit `package-lock.json`. |
| Blank page | **Build output directory** must be `dist`, not `/`. |
| Old assets after deploy | Hard refresh; service worker updates on next visit. |
| `EBADENGINE` for Puppeteer | Harmless warning on Node 20; tests use Puppeteer locally only. |
