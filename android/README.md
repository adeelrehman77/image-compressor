# NexusCompress Android (Trusted Web Activity)

Wraps [https://compress.funadventure.ae/](https://compress.funadventure.ae/) in a full-screen Chrome Custom Tab verified via Digital Asset Links. The web app ships updates through Cloudflare; Play Store releases are only needed for shell/SDK changes.

**Package ID:** `ae.funadventure.nexuscompress`  
**Privacy policy:** [https://compress.funadventure.ae/privacy.html](https://compress.funadventure.ae/privacy.html)

---

## PWA / TWA readiness (repo audit)

| Check | Status | Notes |
|-------|--------|-------|
| `manifest.json` | OK | `start_url` / `scope` `/`, 192+512 icons, `standalone`, `id` |
| Service worker | OK | `public/sw.js` — offline shell for core assets; network-first for JS/CSS |
| Icons | OK | `public/icons/icon-192.png`, `icon-512.png` |
| SW registration | OK | `app.js` registers on production hostnames only |
| Digital Asset Links | **Action** | `public/.well-known/assetlinks.json` — add release SHA-256 before Play upload |
| Deep links | OK | Hash routes in `tools-router.js` (`#photo-checker`, `#pdf-suite/to-md`, etc.) |
| Arabic | OK | `/ar/` page; TWA default start is `/` (EN). Users switch locale in-app or open `/ar/` links |
| CSP | OK | `public/_headers` — wasm + CDN allowlist; TWA uses same origin |

**Theme colour:** manifest `theme_color` aligned to `#0B0C10` (matches HTML dark theme).

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **JDK** | 17 (LTS) | Bubblewrap / Gradle |
| **Android SDK** | API 34+ platform; build-tools 34+ | `sdkmanager` via Android Studio or cmdline-tools |
| **Node.js** | 18+ | Repo build + Bubblewrap CLI |
| **keytool** | bundled with JDK | Keystore + asset links fingerprint |

### Install Android SDK (macOS)

1. Install [Android Studio](https://developer.android.com/studio) or command-line tools only.
2. Set env vars (add to `~/.zshrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

3. Accept licenses and install packages:

```bash
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

4. Verify Bubblewrap environment:

```bash
cd android && npm install && npm run doctor
```

> **Do not run `npm audit fix --force` in `android/`** — it downgrades `@bubblewrap/cli` to 0.5.x and breaks TWA builds. Audit warnings in this dev-only folder are acceptable.

---

## One-time setup

### 1. Build and deploy web assets (asset links)

From repo root:

```bash
npm run build
```

`dist/.well-known/assetlinks.json` is copied from `public/`. After you have a release keystore fingerprint, update the placeholder in `public/.well-known/assetlinks.json`, rebuild, and push to `main` (Cloudflare auto-deploys).

### 2. Generate signing keystore

Bubblewrap can create this during `init`, or manually:

```bash
keytool -genkeypair -v \
  -keystore android/android.keystore \
  -alias nexuscompress \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store passwords in a password manager — **never commit** `*.keystore` (see `.gitignore`).

### 3. Print SHA-256 for asset links

```bash
KEYSTORE_PASS='your-store-password' node scripts/android-fingerprint.js android/android.keystore nexuscompress
```

Paste the colon-separated fingerprint into `public/.well-known/assetlinks.json`, replacing `REPLACE_WITH_RELEASE_SHA256_FINGERPRINT`.

If you use **Play App Signing**, also add Google’s **app signing certificate** fingerprint from Play Console → Setup → App signing (upload key alone is not enough for production users).

Verify after deploy:

```text
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://compress.funadventure.ae&relation=delegate_permission/common.handle_all_urls
```

### 4. Initialize Bubblewrap project (first time)

`android/twa-manifest.json` is the source of truth. Generate the Gradle project:

```bash
cd android
npm install
npx bubblewrap init --manifest=https://compress.funadventure.ae/manifest.json
```

When prompted, use:

- Package ID: `ae.funadventure.nexuscompress`
- Host: `compress.funadventure.ae`
- Start URL: `/`
- Signing key: `android.keystore` / alias `nexuscompress`

If `init` overwrites `twa-manifest.json`, restore fields from git (version codes, colours) then run `npx bubblewrap update`.

### 5. Build APK / AAB

```bash
cd android
npm run build:release   # syncs version, applies twa-manifest, builds signed AAB
```

`prebuild:release` runs `scripts/sync-android-version.js` automatically:
- **versionName** → root `package.json` release stamp (e.g. `20260626.1936`)
- **versionCode** → increments by 1 (Play requires monotonic int; never use the date string as code)
- **manifest-checksum.txt** → updated so `bubblewrap build` skips the “apply twa-manifest changes?” prompt

Do **not** pipe answers into `bubblewrap update` — interactive prompts will corrupt `versionName`.

To sync the name without bumping the code (rare): `SKIP_ANDROID_VERSION_BUMP=1 npm run version:sync`

Output: `android/app-release-bundle.aab` (upload this to Play — **not** `app/build/outputs/bundle/release/app-release.aab`, which is unsigned).

| File | Signed? | Use |
|------|---------|-----|
| `android/app-release-bundle.aab` | Yes | **Play Console upload** |
| `android/app-release-signed.apk` | Yes | Local/sideload testing |
| `app/build/outputs/bundle/release/app-release.aab` | No | Ignore — Gradle intermediate |

### 6. Sync after web manifest changes

When `public/manifest.json` changes:

```bash
cd android && npx bubblewrap update && npm run build:release
```

---

## Deep links

All `https://compress.funadventure.ae/...` URLs on this host open in the TWA once asset links verify.

| URL pattern | Behaviour |
|-------------|-----------|
| `https://compress.funadventure.ae/` | Compress tab |
| `https://compress.funadventure.ae/#photo-checker` | Photo Checker |
| `https://compress.funadventure.ae/#photo-studio` | ID Photo Studio |
| `https://compress.funadventure.ae/#pdf-suite/to-md` | PDF → Markdown |
| `https://compress.funadventure.ae/ar/` | Arabic RTL shell |

Hash routing is handled by `public/js/tools-router.js` — no native code changes needed.

---

## What lives where

| Location | Contents |
|----------|----------|
| **Repo** `public/manifest.json`, `sw.js`, icons | PWA + TWA web requirements |
| **Repo** `public/.well-known/assetlinks.json` | Domain → app verification |
| **Repo** `android/twa-manifest.json` | Bubblewrap config (package, colours, versions) |
| **Repo** `android/` Gradle project | Generated by Bubblewrap; commit after init for CI |
| **Play Console** | Store listing, screenshots, content rating, testers, releases |
| **Play Console** | App signing, closed/open testing tracks |
| **Not in repo** | Keystore passwords, Play service account JSON |

See [PLAY_STORE.md](./PLAY_STORE.md) for listing copy (EN + AR), screenshot captions, and internal test checklist.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Opens in browser tab, not full-screen | Asset links mismatch — check SHA-256 and live URL |
| `bubblewrap doctor` fails | Install JDK 17, Android SDK, set `ANDROID_HOME` |
| White splash then error | Host must match `compress.funadventure.ae` exactly |
| Stale web UI in app | SW cache — bump version via `npm run build`; users get update on next cold start |
| Arabic not default | Expected for v1; link to `/ar/` or add locale redirect on web later |

---

## Versioning

- **Local build:** `npm run build` — no version stamp; `public/` stays clean (no 50-file churn).
- **Deploy / release:** `npm run build:release` or `npm run predeploy` — stamps **UTC** `YYYYMMDD.HHmm` (e.g. `20250626.1830`) into `package.json`, HTML, JS, sitemap.
- **Cloudflare CI:** set build command to `npm run build:release` (or `BUMP_ON_BUILD=1 npm run build`).
- **Android:** `cd android && npm run build:release` — `versionName` = stamp above, `versionCode` = `YYYYMMDDHHmm` integer (auto-incremented).

Only ship a new AAB when the TWA shell changes. Routine tool fixes deploy via the website only.
