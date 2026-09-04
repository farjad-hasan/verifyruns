## 1. Vendor the faces

- [x] 1.1 `frontend/src/fonts/`: `outfit-latin-wght-normal.woff2`, `manrope-latin-wght-normal.woff2`, `jetbrains-mono-latin-wght-normal.woff2` from `@fontsource-variable/*@5.3.0`, plus each package's `LICENSE` as `<family>-LICENSE.txt`
- [x] 1.2 `index.css`: three `@font-face` rules (family names unchanged, `font-weight` range from the package CSS, `font-display: swap`, latin `unicode-range`) replacing the `@import url(https://fonts.googleapis.com/…)`
- [x] 1.3 `public/index.html`: remove both `preconnect` links

## 2. CSP and spec

- [x] 2.1 `_headers`: `style-src 'self' 'unsafe-inline'`, `font-src 'self'`
- [x] 2.2 `DESIGN.md` typography note; spec deltas validate (`openspec validate --all --strict`)

## 3. Verify, then ship

- [x] 3.1 `CI=true corepack yarn build` compiled 2026-09-05; three woff2 under `build/static/media/`; zero `googleapis`/`gstatic` references in `build/index.html` and the built CSS
- [x] 3.2 Edge on the local build (`python3 -m http.server 3200` over `build/`), 2026-09-05: `document.fonts` → `Outfit 100 900 loaded`, `Manrope 200 800 loaded`, `JetBrains Mono 100 800 loaded`; the only resource host is the local origin; three woff2 requests of 25/41/33 KB; computed `h1` family Outfit, `body` Manrope; screenshot of `/` matches the deployed typography
- [ ] 3.3 PR merged, deploy green, live CSP header has no Google origin; `CLAIMS.md` flipped, change archived, worktree removed
