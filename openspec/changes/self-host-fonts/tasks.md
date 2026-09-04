## 1. Vendor the faces

- [ ] 1.1 `frontend/src/fonts/`: `outfit-latin-wght-normal.woff2`, `manrope-latin-wght-normal.woff2`, `jetbrains-mono-latin-wght-normal.woff2` from `@fontsource-variable/*@5.3.0`, plus each package's `LICENSE` as `<family>-LICENSE.txt`
- [ ] 1.2 `index.css`: three `@font-face` rules (family names unchanged, `font-weight` range from the package CSS, `font-display: swap`, latin `unicode-range`) replacing the `@import url(https://fonts.googleapis.com/…)`
- [ ] 1.3 `public/index.html`: remove both `preconnect` links

## 2. CSP and spec

- [ ] 2.1 `_headers`: `style-src 'self' 'unsafe-inline'`, `font-src 'self'`
- [ ] 2.2 `DESIGN.md` typography note; spec deltas validate (`openspec validate --all --strict`)

## 3. Verify, then ship

- [ ] 3.1 `CI=true corepack yarn build`; the three woff2 files appear under `build/static/media/`; `grep -c "googleapis\|gstatic" build/index.html build/static/css/*.css` is 0
- [ ] 3.2 Edge on the local build or the deployed site: `document.fonts` reports Outfit, Manrope and JetBrains Mono loaded; `performance.getEntriesByType("resource")` shows no host other than the site and the API
- [ ] 3.3 PR merged, deploy green, live CSP header has no Google origin; `CLAIMS.md` flipped, change archived, worktree removed
