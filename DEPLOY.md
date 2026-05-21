# Deploy NexusCompress to Cloudflare Pages

This project builds a static site into `dist/`. Cloudflare Pages serves that folder after each Git push.

## Prerequisites

- A [Cloudflare](https://dash.cloudflare.com) account
- This repository pushed to GitHub, GitLab, or Bitbucket

## One-time setup

1. **Push the repo** to your Git provider.

2. In Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.

3. Select this repository and configure:

   | Setting | Value |
   |---------|--------|
   | **Production branch** | `main` (or your default branch) |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | **Root directory** | `/` (leave empty if repo root) |

4. **Environment variables** (optional): none required for the static app.

5. Click **Save and Deploy**. The first build runs `npm install` (via Pages) then `npm run build`.

## Custom domain

After the first deploy: **Custom domains** → add your domain and follow DNS instructions.

## Local production preview

```bash
npm install
npm run build
npm run preview
```

Open the URL shown (default `http://localhost:3000`) — serves the `dist/` folder.

## Wrangler CLI (optional)

```bash
npm install -g wrangler
npm run build
npx wrangler pages deploy dist --project-name=nexuscompress
```

`wrangler.toml` already sets `pages_build_output_dir = "dist"`.

## Security headers

`public/_headers` is copied to `dist/_headers` and applied automatically on Cloudflare Pages.

## Notes

- **No server runtime** — compression is 100% client-side.
- **Service worker** caches the app shell for faster repeat visits.
- **Node version**: use **18+** or **20** in Pages → Settings → Environment variables → `NODE_VERSION=20` if needed.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on `postcss` | Ensure `npm run build` works locally; commit `package-lock.json`. |
| Blank page | Confirm **Build output directory** is `dist`, not `/`. |
| Old assets after deploy | Hard refresh; service worker updates on next visit. |
