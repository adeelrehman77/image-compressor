# PageSpeed Performance Pass — Implementation Plan

> **For agentic workers:** Execute task-by-task. Arabic is covered by editing EN sources + build generation — never edit `public/ar/index.html` by hand.

**Goal:** Raise Mobile & Desktop Lighthouse Performance to ≥ 90 on `/` and `/ar/`.

**Architecture:** Remove eager heavy scripts, stop desktop idle tool preload, defer non-critical head JS, minify dist JS, add `<main>`, light ARIA/contrast fixes. Arabic inherits via `generate-ar-index.js`.

**Tech Stack:** Vanilla JS, PostCSS/cssnano, esbuild minify, Cloudflare Workers static assets.

## Global Constraints

- Never edit `public/ar/index.html` directly.
- Keep `locale.js` synchronous in `<head>` (RTL/`lang` before paint).
- AI Upscaler must still load ONNX on demand via `ai-upscaler.js`.
- Both `dist/index.html` and `dist/ar/index.html` must pass verify checks.

## Files

- Modify: `public/index.html`
- Modify: `public/js/tools-router.js`
- Modify: `scripts/build.js`
- Modify: `scripts/verify-dist.js`
- Modify: `public/css/tokens.css` and/or dark `--text-muted` in app source (if contrast still weak)
- Generated: `dist/ar/index.html`, `dist/ar/tools/*/index.html` (build only)

---

### Task 1: Remove eager ONNX + defer head scripts + `<main>` + ARIA list fix

**Files:** `public/index.html`

- [ ] Remove CDN `ort.min.js` script tag near bottom.
- [ ] Add `defer` to `i18n.js`, `tool-meta.js`, `tool-routes.js`; leave `locale.js` sync.
- [ ] Add `defer` to `ads-config.js`.
- [ ] Wrap from first `#tool-panel-compress` through content before `<footer class="site-footer` in `<main class="app-main">` … `</main>`.
- [ ] On compress workflow strip: remove `role="list"` / `role="listitem"` (keep visual markup).

### Task 2: Disable idle tool preload

**Files:** `public/js/tools-router.js`

- [ ] Make `preloadToolsIdle` a no-op (or remove its call) so desktop no longer fetches 7 tools after idle.

### Task 3: Minify first-party JS in build

**Files:** `scripts/build.js`

- [ ] After `copyDir` / before or after patch-html, run esbuild minify over `dist/js/**/*.js` and `dist/js/**/*.mjs`, skipping `*.min.js` and leaving `vendor/` alone (already minified).

### Task 4: Verify EN + AR

**Files:** `scripts/verify-dist.js`

- [ ] Assert neither `dist/index.html` nor `dist/ar/index.html` contains `onnxruntime-web` / `ort.min.js` script src.
- [ ] Assert both contain `<main` and `locale.js` without requiring defer on locale.
- [ ] Run `SKIP_VERSION_BUMP=1 npm run build` and confirm.

### Task 5: Contrast (if needed)

- [ ] Bump dark `--text-muted` toward WCAG AA on muted chips/labels in the token/CSS source used by the app (not guides-only `styles.css`).

### Task 6: Smoke

- [ ] Build; grep dist EN/AR for onnx script absence.
- [ ] Confirm `dir="rtl"` on AR; tools-router still `ensureTool` on navigate.
