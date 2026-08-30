## Why

The interface has a real design system — documented 2026-08-29 as `DESIGN.md` + `PRODUCT.md`, replacing the Emergent-era `design_guidelines.json` — but the shipped UI drifts from it in ways a user can feel: every caption and helper line is set in a grey that fails WCAG AA on every surface (`#71717A` on `#0A0A0A` is 4.1:1, on cards 3.9:1), and PASS/FAIL — the product's only signal — is encoded by red-vs-green hue alone (the two squares have a 1.48:1 luminance contrast; in greyscale or to a red-green colour-blind reader they are the same square). An audit pass with impeccable (59 deterministic rules on the live Pages site, desktop and 390 px) plus an isolated design review found 49 machine-verifiable anti-patterns and a short list of judgment issues. Now, because the public status page is the surface an agency hands to a client, and the first FAIL alert is the moment the product earns trust.

## What Changes

- **Verdict gets a second channel.** Timeline squares, badges and the health strip carry a glyph or shape in addition to hue, so PASS/FAIL survives greyscale screenshots and colour-vision deficiency.
- **Muted text meets AA.** The `text-muted` token moves from `#71717A` to a value ≥ 4.5:1 on every surface; captions that must stay quiet use it at a larger size rather than a darker grey.
- **Form labels become real labels.** New Check and the Expectations editor stop using placeholders as the only label; every input has an associated `<label>`; selects in Run history filters are named.
- **The run sheet becomes a dialog.** `role="dialog"`, focus trapped, Escape closes, focus returns to the square that opened it.
- **Destination URLs mask query-string values.** The Destination card and public surfaces never print `?apikey=…`, `?token=…` or any query value in full — same last-4 rule as bearer tokens.
- **The sentence surfaces where it is the answer.** The list API returns each run's `diff_message`; the dashboard row shows the newest sentence under the check name; Check detail shows a "Latest verdict" block under the H1 and, once runs exist, moves setup cards below the run history.
- **Failed loads say so.** Dashboard and Check detail render a sentence and a Retry on 404 or network failure instead of "Loading…" forever.
- **Public status page becomes a teammate monitoring page.** The label comes from the Check's connector kind (today it hardcodes "HTTP / JSON check"); it gains "as of" with timezone, the heartbeat expectation, and per-channel alert delivery for the latest run (`checked_at`, `heartbeat_hours`, `alerts_sent: [{kind, ok}]` added to the public API — never a target).
- **Scaffold leftovers removed.** `public/index.html` stops loading Inter; the detector's kicker/line-length/pulse findings on marketing pages are fixed or recorded as intentional exceptions in `.impeccable/config.json`.
- **Design authority is checked in.** `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, and the impeccable skill under `.claude/skills/` are committed; `design_guidelines.json` is deleted.

## Capabilities

### New Capabilities
- `design-system`: the visual contract every surface must satisfy — verdict encoding, text contrast, typography sources, form labelling, dialog behaviour.

### Modified Capabilities
- `checks`: "Detail view is connector-aware" — the Destination card masks query-string values in the HTTP/JSON URL, not only the bearer token; "List, read, update, delete own Checks only" — the list route includes each recent run's `diff_message`.
- `public-status`: "Public page exposes verdicts only" — verdicts readable without colour; real connector label; `checked_at`, `heartbeat_hours` and target-free `alerts_sent` exposed and rendered.

## Impact

`frontend/src/index.css` (tokens), `components/Timeline.jsx`, `pages/{Dashboard,CheckDetail,NewCheck,PublicStatus,Landing,Pricing,DataPage,SecurityPage,AuthPage}.jsx`, `public/index.html`; a masking helper in the worker's check sanitiser (`worker/src/`) so the API, not the page, is the one that never returns a full query string; existing Playwright/test ids unchanged. API additions: masked `config.url`, `diff_message` on `recent_runs`, and three read-only fields on the public endpoint.
