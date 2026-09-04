## Why

Every page load fetches a stylesheet from `fonts.googleapis.com` and three font files from
`fonts.gstatic.com`, so Google sees every visitor's IP address before the page has rendered. The
privacy policy names two providers (Cloudflare, Resend) and does not mention Google; German
courts have treated exactly this pattern as a GDPR transfer without a legal basis. After
`remove-analytics` (2026-09-04) the fonts are the last third-party request on the site. The three
faces — Outfit, Manrope, JetBrains Mono — are all SIL Open Font License, so they can be served
from the site's own origin, which also removes a render-blocking cross-origin round trip.

## What Changes

- **Vendor the fonts**: the latin variable woff2 for each family (from the `@fontsource-variable`
  packages, OFL-1.1) under `frontend/src/fonts/` with each family's licence file, and
  `@font-face` rules in `index.css` that keep the family names `Outfit`, `Manrope` and
  `JetBrains Mono` unchanged, so no token in `DESIGN.md` and no `font-family` declaration moves.
- **Drop the Google import** in `index.css` and the two `preconnect` tags in `index.html`.
- **Tighten the CSP**: `style-src 'self' 'unsafe-inline'`, `font-src 'self'` — no `data:`
  (nothing uses it).
- **Spec**: `design-system` "Only the system typefaces load" now says the faces are served from
  the site's own origin; `deployment` "Security headers" gains the style/font origin clause.

## Capabilities

### Modified Capabilities
- `design-system`: typefaces are self-hosted; no page requests a font provider.
- `deployment`: CSP style and font sources are the site's own origin only.

## Impact

`frontend/src/index.css`, `frontend/src/fonts/` (new: three `.woff2` files, three licence files),
`frontend/public/index.html`, `frontend/public/_headers`, `DESIGN.md` (one sentence noting the
faces are vendored), `openspec/specs/design-system/spec.md`, `openspec/specs/deployment/spec.md`.
No dependency added; no API change.
