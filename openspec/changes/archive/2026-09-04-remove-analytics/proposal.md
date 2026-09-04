## Why

PostHog product analytics shipped on 2026-08-31 (`ba3f855`) two days after the privacy policy
was written, and the policy was never updated. A review on 2026-09-04
(farjad-world `docs/research/2026-09-04-verifyruns-copy-claims-legal-review.md`) checked the
project itself: it has never been opened (starter dashboard and all eight insights have no
views), holds one identified person (the maintainer), and in five days collected 133 events —
130 of them the maintainer's own. Meanwhile it stores every visitor's IP and GeoIP city
("Discard client IP data" is off), autocapture sends the text of every clicked element (Check
names and verdict sentences are already in it), `identify` sends the account email, and
`$current_url` is captured unmasked, so the raw password-reset token in `/reset?token=…` and
every `/status/<token>` link would reach a US vendor on page load. Each of those contradicts a
sentence on `/privacy` or `/security`, and the `deployment` spec already requires a CSP that
allows scripts from the site's own origin only — `_headers` has been out of spec since the same
commit. Nothing is read from it, so the cheapest true state is no analytics at all.

## What Changes

- **Remove PostHog**: the `posthog-js` dependency, its init in `index.js`, the `identify` /
  `capture` / `reset` calls in `auth.jsx` and `NewCheck.jsx`, and the `REACT_APP_POSTHOG_KEY`
  from the deploy workflow and `docs/deploy.md`.
- **Restore the CSP** in `frontend/public/_headers` to the spec: `script-src 'self'`,
  `connect-src 'self' <API>`. This also blocks the Cloudflare Web Analytics beacon the Pages
  platform injects, so no analytics script runs even if the dashboard toggle stays on.
- **Harden the spec**: the "Security headers" requirement gains an explicit "no third-party
  analytics or tracking script" clause, so the next analytics proposal has to change the spec,
  the privacy policy and the security page in the same change.

## Capabilities

### Modified Capabilities
- `deployment`: "Security headers on both origins" — adds the no-tracking-script clause and a
  scenario for a platform-injected beacon.

## Impact

`frontend/src/index.js`, `frontend/src/lib/auth.jsx`, `frontend/src/pages/NewCheck.jsx`,
`frontend/package.json`, `frontend/yarn.lock`, `frontend/public/_headers`,
`.github/workflows/deploy.yml`, `docs/deploy.md`, `openspec/specs/deployment/spec.md`. No API
or data-model change. The legal-page text edits the review recommends (date bump, provider
list, Google Fonts) are a separate decision and are not in this change. Deleting the PostHog
project and its collected data is a dashboard action for the maintainer, not code.
