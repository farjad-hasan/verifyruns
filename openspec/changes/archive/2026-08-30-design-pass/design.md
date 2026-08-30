## Context

See proposal.md — Why. Evidence and scores are in `docs/design-audit-2026-08-29.md` (audit 12/20,
critique 23/40). The design authority is `DESIGN.md` (tokens in YAML frontmatter, read by
impeccable's detector and hook) and `PRODUCT.md`; `.impeccable/design.json` is the sidecar the
live panel renders from and is regenerated whenever `DESIGN.md` changes. The impeccable skill is
vendored at `.claude/skills/impeccable/` so Claude Code, Emergent's agent and any other harness
read the same rules; its hook (`.claude/settings.local.json`, machine-local) runs the detector
after every UI edit. Constraints: React 19 + CRA + Tailwind; shadcn `dialog`/`drawer` already
in `components/ui/`; every `data-testid` must survive; the API is a Cloudflare Worker whose
`sanitizeCheck` already masks secrets to last-4; `openspec/changes/password-reset`,
`legal-pages` and `deletion-purges-everything` are in flight in the same tree and add routes
(`/forgot`, `/reset`, `/terms`, `/privacy`) this change does not touch.

## Goals / Non-Goals

**Goals:**
- Verdicts readable without colour, on every surface, from one primitive.
- Every WCAG AA text-contrast and labelling failure closed; the run sheet a real dialog.
- The verdict sentence visible on the dashboard row and at the top of Check detail.
- Query-string values never leave the API unmasked.
- The design system checked in and enforced (DESIGN.md + detector hook), scaffold leftovers gone.

**Non-Goals:**
- No redesign: the incumbent world (dark, flat, three faces, two hues) is preserved; this is
  `polish`/`harden`, not `bolder`.
- No change to verdict rules, alert semantics or data retention.
- Org/team accounts: the public link is the team mechanism (Farjad, 2026-08-29).
- Light theme, i18n, and the `pricing-tiers` page beyond its prose measure.

## Decisions

- **FAIL is a ring, PASS is a solid** (`.tl-square.fail { background: transparent; box-shadow:
  inset 0 0 0 3px var(--verdict-fail) }`). Alternatives: a glyph inside a 12 px square (illegible
  at that size), a different shape (rounded vs square reads as a style choice, not a state). The
  ring changes both shape and luminance (hollow square is mostly `#121214`), so it survives
  greyscale, and the landing's static strip inherits it with no JSX change. Health-strip dots and
  the public page use the same class. Badges already carry text.
- **Accessible names live on the square, not in `title`.** `aria-label="FAIL · 29 Aug 2026,
  03:06"`; `title` kept for hover. Empty squares stay `div` with `aria-hidden`.
- **`text-muted` becomes `#8A8A93`** (5.79:1 on ink, 5.18:1 on raised) rather than `zinc-400`,
  so captions stay visibly quieter than body text but clear AA on every surface. Implemented as a
  Tailwind token (`muted`) and a global replace of `text-zinc-500` → `text-muted`; `zinc-600`
  text (2.6:1) is removed from text use entirely. Placeholders are exempt but no longer the only
  label. `DESIGN.md` frontmatter updated in the same commit.
- **Labels reuse the existing Label style** (11 px uppercase tracked, `mb-2`) already used in
  Expectations — no new pattern. Eyebrows on app pages ("DASHBOARD", "NEW CHECK") are removed;
  marketing eyebrows stay and are recorded as an intentional detector ignore.
- **The run sheet is the shadcn `Sheet`/`Dialog`** (Radix) — focus trap, Escape, restore, scroll
  lock for free; the current hand-rolled overlay is deleted. Sheet scrim keeps `backdrop-blur-sm`
  and `DESIGN.md`'s One Blur Rule is amended to "nav and modal scrims".
- **URL masking is server-side.** `sanitizeCheck` rewrites `config.url` so every query value is
  `••••` + last 4 (keys and path intact); the raw URL is only ever in the encrypted config and the
  edit form (which loads it through the existing authenticated PATCH path). Alternative — mask in
  the client — rejected because the public status API and any future export would still leak.
- **`listChecks` returns `diff_message` on `recent_runs`** (one extra column in the existing
  query, 30 rows per check). The dashboard row renders the newest sentence under the name.
  Alternative — a separate `latest_run` field — rejected; the data is already fetched.
- **The check name stays the H1; the sentence becomes the visual lead** (decided 2026-08-29 as
  the design call Farjad delegated). Alternative — the latest sentence as the H1 — rejected: a
  sentence is long, variable, and changes every 10 s under polling, so a mutating H1 breaks the
  page's identity, the tab title and the back-button mental model. Instead the H1 steps down one
  size (`text-3xl`), and directly under it the **Latest verdict** block sets the badge and the full
  sentence at `text-lg sm:text-xl` Manrope in `text-primary` with a mono "12 min ago · webhook"
  line — the largest body text on the page, so the eye lands on it first.
  **Amended 2026-08-30 after review of the built page:** the block floated between the H1 and the
  timeline with three unrelated gaps, ran the full container width (~110 ch) and showed the
  browser's default focus rectangle. It now lives *inside* the timeline card as one **state card**
  — badge + time, the sentence at a 70 ch measure with `text-wrap: pretty` (no orphaned last word),
  a hairline, then the strip — and the app gained a themed `:focus-visible` ring so no control
  ever shows the UA outline.
- **Detail page order once runs exist:** header → Latest verdict → timeline → Run history → Alert
  channels → Public status → Setup (Webhook, Destination, Expectations) collapsed by default. With
  zero runs the current order stays, since Setup *is* the task.
- **Early timelines keep all 30 slots and the right anchor; the empties become ghosts** (decided
  2026-08-29). Alternatives — dropping empties (loses the fixed width that makes rows comparable
  and "newest on the right" legible) or fading them further per-row (inconsistent) — rejected.
  Empties render at `#1C1C1F` (one tonal step above the panel) instead of hairline `#27272A`, so
  real runs are figure and empties are ground; the caption reads "3 of 30 runs" until the window
  fills. A first PASS is then one bright square on a quiet strip, not one square among 29 chips.
- **The public status page is for teammates** (Farjad, 2026-08-29): the internal check name stays
  the H1 (no display-name field), Enable keeps its single click (the audience is the team, not a
  client), and the public API gains three read-only fields for monitoring: `checked_at` (last
  evaluation), `heartbeat_hours`, and per run `alerts_sent` reduced to `[{kind, ok}]` — never the
  target. The page shows "as of {time} ({tz})", "expects a run every N h", and "alerted: slack ✓ ·
  email ✗" on the latest run.
- **Timeline at narrow widths:** `.tl-square { flex-shrink: 0 }`; the container is `overflow-x:
  auto` and right-anchored (`justify-content: flex-end`, scrolled to end on mount) so the newest
  square is always visible; the dashboard row shows the last 10 squares below `sm` instead of
  hiding the strip. Alternative — wrapping into two rows — rejected because "newest on the right"
  becomes ambiguous.
- **Load failures reuse the `PublicStatus` pattern**: an `error` string rendered in the same card
  with a Retry button; 404 → "This check doesn't exist or was deleted."
- **Detector exceptions are recorded, not silenced globally**: `.impeccable/config.json`
  `detector.ignoreValues` for sonner's `height 400ms`; inline `impeccable-disable-line` comments
  for `.rp-grid`, the pulsing early-access dot, and the display leading; the kicker rule ignored
  for `frontend/src/pages/{Landing,Pricing,DataPage,SecurityPage}.jsx` only.

## Risks / Trade-offs

- [Global `text-zinc-500` → `text-muted` replace touches ~100 sites] → do it with one sed and
  review the diff; the Tailwind token keeps the class shape so no test id or layout moves.
- [Ring FAIL squares read lighter than solid PASS, inverting perceived "weight"] → the 3 px ring
  at 12–16 px is ~55 % red pixels; verified in a greyscale screenshot before merge (task 7.3).
- [Reordering Check detail moves the webhook URL down for users mid-setup] → order is conditional
  on `runs.length > 0`; a check with no runs is unchanged.
- [Masking `config.url` could break the edit form if it reads the sanitised value] → the form
  must fetch the raw URL through the authenticated path used for other secrets; task 4.2 tests
  round-tripping a URL with `?apikey=` unchanged when the field is left untouched.
- [Radix Sheet changes DOM structure under `data-testid="run-panel"`] → keep the test id on the
  content element; run the existing frontend checks.
- [Two OpenSpec changes in flight touch the same pages (`legal-pages`, `password-reset`)] →
  this change does not edit `App.js` routes or the new pages; the muted-token replace is applied
  to them only after those changes land, in a follow-up commit.

## Migration Plan

Frontend and worker deploy together (Pages + Worker); the only API change is additive
(`diff_message` on `recent_runs`, masked `config.url`). Rollback is a redeploy of the previous
commits. `design_guidelines.json` deletion is already staged.

## Open Questions

None. The three raised by the critique (sentence as H1, early-timeline empties, public-page
audience) were resolved 2026-08-29 — see Decisions. Primary user remains "undecided" in
PRODUCT.md, which is a product fact this change designs around (solo operator on a phone as the
smallest case), not a question it needs answered.
