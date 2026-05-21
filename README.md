# NexusCompress

Professional, privacy-first image optimization in the browser. **Files never leave your device.**

## Quick start

```bash
npm install
npm run dev        # development — http://localhost:3000 (public/)
npm run build      # production bundle → dist/
npm run preview    # serve dist/ locally
npm test           # build + E2E test
```

## Project structure

| Path | Purpose |
|------|---------|
| `public/` | Source HTML, JS, assets (edit here) |
| `src/styles/main.css` | Font imports + bundles `public/css/styles.css` |
| `dist/` | **Deploy this folder** (generated, gitignored) |
| `scripts/build.js` | Production build |
| `DEPLOY.md` | Cloudflare Pages via Git |

## Features

- Presets (Web, Email, Social, Archive)
- AVIF / WebP / JPEG / PNG
- EXIF orientation, target file size, batch ZIP
- Offline-capable PWA (no CDN fonts or Tailwind)
- CLI for automation (`npm run compress`)

## CLI

```bash
npm run compress -- ./photos --preset web --out ./optimized
```

## Deploy to Cloudflare Pages

1. Push repo to GitHub/GitLab.
2. Cloudflare → Pages → Connect repo.
3. **Build command:** `npm run build`
4. **Build output directory:** `dist`
5. **Deploy command:** `npx wrangler deploy` (if the UI requires it; see DEPLOY.md)

See [DEPLOY.md](./DEPLOY.md) for full steps.

## SEO

Canonical site: **https://compress.funadventure.ae** — see [SEO.md](./SEO.md) for Google checklist and ranking notes.

## License

ISC
