# Design audit — 2026-08-29

Method: `impeccable audit` (technical) + `impeccable critique` (design review) against the live
Pages site and the source at `frontend/src/`. Deterministic evidence from
`npx impeccable detect` (59 rules, full-browser render) on `/`, `/pricing`, `/data`, `/security`,
`/login` at 1280×800 and 390×844; logged-in surfaces (dashboard, check detail, run sheet, new check)
inspected in Edge at 1720 px; the public status page reviewed from code (not enabled on the
dogfood check, and enabling it is an account-state change this pass did not make).

⚠️ DEGRADED critique: the detector ran in the parent context before the design review, so the
review agent was isolated from detector output but the synthesis was not. Recorded per the
impeccable playbook; the finding set is unaffected.

Design authority for this audit: `DESIGN.md` and `PRODUCT.md` (written the same day, extracted
from `index.css` and the components; `design_guidelines.json` retired). The fixes are tracked in
`openspec/changes/design-pass/`.

---

## Part 1 — Technical audit (`impeccable audit`)

### Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | **1** | Verdict is hue-only (PASS vs FAIL squares 1.48:1); every caption colour fails AA; form inputs labelled by placeholder only; run sheet is not a dialog (no role, no focus trap, no Escape handler) |
| 2 | Performance | **3** | Lean CRA bundle; one third-party `transition: height` (sonner); 10 s polling on three pages is fine; `backdrop-blur` on nav and the sheet overlay only |
| 3 | Responsive | **2** | Public pages clean at 390 px except body text touching the viewport edge on `/`; dashboard hides the timeline below `sm` (the hero component disappears on phones); `grid-cols-3` connector cards on New Check have no phone breakpoint |
| 4 | Theming | **3** | Coherent hex system, now tokenised in `DESIGN.md`; ~20 hard-coded hexes in JSX (`border-[#27272A]`, `bg-[#0A0A0A]`) that should be Tailwind tokens; dark-only by design |
| 5 | Implementation integrity | **3** | Specific, product-shaped system (the sentence + the timeline); leftovers: Inter still requested, marketing pages use the kicker-above-heading pattern eight times, one decorative grid backdrop |
| **Total** | | **12/20** | **Acceptable — significant work needed, concentrated in accessibility** |

### Implementation integrity verdict — PASS (with leftovers)

The implementation expresses a product-specific system: three typefaces with fixed jobs, a
two-hue verdict vocabulary on an achromatic scale, one signature component reused identically on
four surfaces, and the FAIL sentence as the hero. It is not interchangeable with another product.
Detector findings that survive verification are leftovers from the scaffold and generated-UI
habits, not systemic drift.

### Detector findings (verified)

**After `design-pass` tasks 2–7 (local build, same five URLs): desktop 2, mobile 1 — both the em-dash advisory plus one 98-char `<li>` on `/security`. `low-contrast`, `overused-font`, `undersized-ui-text`, `body-text-viewport-edge` all 0; the five intentional rules are recorded in `.impeccable/config.json`.**

Before: 49 findings desktop, 29 at 390 px; after de-duplication and false-positive removal:

| Rule | Count | Verified? | Source |
|---|---|---|---|
| `low-contrast` | 9 on `/`, 1 each elsewhere | **Yes** | `text-zinc-500` (`#71717A`): 4.10:1 on `#0A0A0A`, 3.87:1 on `#121214`, 3.67:1 on `#18181B`. Used for every caption, eyebrow, helper line, section subtitle (`NewCheck.jsx:221`), timestamp |
| `kicker-above-heading` | 8 | Yes (pattern), **intentional** | `text-xs uppercase tracking-widest` eyebrow above every H1/H2 — `Landing.jsx:112,131,152,170`, `Pricing.jsx:38`, `AuthPage`, `DataPage`, `SecurityPage`. DESIGN.md records it as the Label role; keep on marketing pages, but the app pages ("DASHBOARD" above "Your Checks", "NEW CHECK" above "Create a check") add nothing |
| `line-length` | 3 on `/`, 7 each on `/data` and `/security` | **Yes** | `max-w-2xl` prose at 18 px runs ~86–98 chars; `/data` and `/security` have no measure at all |
| `undersized-ui-text` | 3 on `/` | **Yes** | `text-[10px]` labels: `Landing.jsx:137` card tags, `Dashboard.jsx:66,69,140` (heartbeat, Snoozed, health-strip labels) |
| `pulsing-dot` | 1 | Yes — **keep** | Early-access badge dot (`Landing.jsx:74`, `Pricing.jsx:48`). Decorative liveness; DESIGN.md allows it on this one badge. Record as an inline ignore |
| `codex-grid-background` | 1 | Yes — **keep** | `.rp-grid` hero backdrop (`index.css:26`). Radially masked, 4 % lines; the only decorative geometry. Record as ignore |
| `layout-transition` | 1 per page | Yes — **third-party** | `sonner/dist/styles.css`: `transition: … height 400ms`. Not ours; ignore-value |
| `overused-font` | 1 | **Yes** | `public/index.html:10` requests Inter; nothing uses it (`index.css` sets Manrope/Outfit/JetBrains Mono). Delete the link |
| `body-text-viewport-edge` | 3 at 390 px on `/` | **Yes** | Hero grid + `px-6` — text reaches the edge inside the hero at 390 px |
| `tight-leading` | 1 | Yes — **keep** | H1 `leading-[1.05]` (`Landing.jsx:78`), deliberate display leading |
| `gray-on-color` (local regex only) | 2 | **False positive** | `Landing.jsx:51` — `text-zinc-400` on `bg-emerald-500/10` (a wash, not a fill) |
| `em-dash-overuse` (advisory) | 1 | Noted | 8 em-dashes on `/`; house voice, not changed by this pass |

### Detailed findings by severity

**[P1] Verdict encoded by hue alone** — `Timeline.jsx:14-22`, `index.css` `.tl-square.pass/.fail`,
`.badge-pass/.badge-fail`, `Dashboard.jsx:118-121` health strip dots. Category: Accessibility.
Impact: PASS and FAIL squares measure 1.48:1 against each other — a greyscale Slack screenshot of
a status page, or a protan/deutan reader, cannot tell a green run from a red one; the badge text
saves the badge but nothing saves the square. WCAG 1.4.1 Use of Color. Fix: FAIL squares get a
glyph (× or a notched corner) or a distinct shape (rounded PASS vs square FAIL), plus
`aria-label="FAIL · <time>"`; badges already carry text; health-strip dots get the same glyph.
Suggested command: `/impeccable polish timeline`.

**[P1] Muted grey fails AA everywhere** — `text-zinc-500` in ~100 places (43 in `CheckDetail.jsx` alone); `.rp-input::placeholder`
`#52525B` (2.56:1). Category: Accessibility. Impact: helper text under every form field, every
timestamp and every section subtitle sits below 4.5:1. WCAG 1.4.3. Fix: token `text-muted` →
`#8A8A93` (5.79:1 on ink, 5.18:1 on raised) or `zinc-400` where the text is a sentence; keep
`#71717A` only for ≥ 19 px bold. Placeholders may stay (exempt) but should not carry the only
label (next item). Suggested: `/impeccable colorize` scoped to the neutral scale.

**[P1] Placeholder-only labels** — `NewCheck.jsx:116-127,133-139,144-153`, `CheckDetail.jsx`
Alert channels `input` (`:474`), `RunFilters` three selects (`:689-715`). Category:
Accessibility. Impact: once typed into, the field has no visible label; screen readers announce
"edit text". WCAG 1.3.1 / 3.3.2. Fix: visible `<label for>` in the Label style already used in
Expectations. Suggested: `/impeccable harden new-check`.

**[P1] Run sheet is not a dialog** — `CheckDetail.jsx:283` (`RunPanel`). Category:
Accessibility. Impact: no `role="dialog"`, no focus trap, no keydown handler so Escape cannot close it (the
overlay is hand-rolled, not Radix — `CheckDetail.jsx:283-296`), focus does not return. WCAG 2.1.2 / 4.1.2. Fix: use the shadcn
`dialog`/`drawer` already in `components/ui/` (Radix handles trap, Escape, restore). Suggested:
`/impeccable harden check-detail`.

**[P1] Destination URL prints query-string secrets** — `CheckDetail.jsx:196` `Row k="GET url"`.
Category: Implementation integrity (security-adjacent). Impact: bearer tokens are masked to
last-4 but `?apikey=…` in the URL is printed in full, five lines of it, in a card that appears in
screenshots. The dogfood key is a Supabase *publishable* key so no exposure today; a user pasting
a Bearer-in-query destination would be exposed. Fix: mask query values server-side in the check
sanitiser so no client ever receives the full string. Suggested: `/impeccable harden`.

**[P2] Dashboard hides the timeline on phones** — `Dashboard.jsx:76` `hidden sm:block`. Impact:
the hero component is absent on the device the 2 am FAIL alert is opened on. Fix: below `sm`
render the last 10 squares, or wrap the row so the strip sits under the name. Suggested:
`/impeccable adapt dashboard`.

**[P2] New Check connector cards `grid-cols-3` with no breakpoint** — `NewCheck.jsx:103`. Impact:
three 100 px cards at 390 px with two-line titles. Fix: `grid-cols-1 sm:grid-cols-3`.

**[P2] Prose measure on `/data`, `/security`, `/pricing`** — no `max-w-prose`/`max-w-2xl` on
paragraphs, 86–98 chars/line. Fix: `max-w-[65ch]` on the article column. Suggested:
`/impeccable typeset`.

**[P2] 10 px labels** — `Dashboard.jsx:66,69,140`, `Landing.jsx:137`. Fix: 11 px minimum
(`text-[11px]`), keep tracking.

**[P3] Inter link in `public/index.html:10`** — delete.

**[P3] Hard-coded hexes in JSX** — `border-[#27272A]`, `bg-[#0A0A0A]`, `bg-[#18181B]`,
`divide-[#27272A]` (~20 sites). Fix: extend `tailwind.config.js` with the DESIGN.md tokens
(`hairline`, `ink`, `panel`, `raised`) and replace. Suggested: `/impeccable extract`.

**[P3] Icon-only destructive control** — `Nav.jsx:38` delete-account trash icon is 13×13 px
with only a `title`. Fix: `aria-label`, 44 px hit area, and it arguably belongs on a settings
surface, not the global nav.

**[P3] Sheet overlay `backdrop-blur-sm`** — `CheckDetail.jsx:287`. DESIGN.md's One Blur Rule
names the nav as the only blur; either amend the rule (modal scrims are a reasonable second
exception) or drop the blur. Recorded in tasks as "decide".

### Patterns and systemic issues

- One grey, one hundred uses: `text-zinc-500` is the whole secondary voice, so a single token
  change fixes ~90 % of contrast findings — but must be done at the token, not per site.
- The Label style (10–12 px, uppercase, tracked) is used for three different jobs: eyebrows,
  form labels, and data captions. Splitting it into two sizes (11 px eyebrow, 12 px form label)
  resolves both the undersized-text and the placeholder-label findings without a new look.
- Verdict colour appears on five component types; the second channel must be one primitive
  (a `Verdict` glyph) reused by all five, or the surfaces will drift again.

### Positive findings

- The FAIL sentence as hero, on the landing page and in every row, is the right call and is
  implemented consistently (`marketing-site` spec: never truncated — verified, it wraps).
- Newest-on-the-right with grey padding is consistent across four surfaces.
- Transitions are specific (`background-color`, `border-color`, `transform`) at 140–160 ms; no
  `transition: all`, no bounce easing.
- Every interactive element carries a `data-testid`.
- Secrets in *fields* are masked to last-4 everywhere they appear; the URL is the one gap.
- Empty states teach (dashboard 3-step, check detail "trigger your workflow").

### Recommended actions (priority order)

1. **[P1] `/impeccable polish timeline`** — second verdict channel, one primitive, five sites.
2. **[P1] `/impeccable colorize`** (neutral scale only) — `text-muted` token to ≥ 4.5:1.
3. **[P1] `/impeccable harden new-check`** and **`/impeccable harden check-detail`** — labels, dialog
   semantics, masked query strings.
4. **[P2] `/impeccable adapt dashboard`** — timeline on phones; connector cards breakpoint.
5. **[P2] `/impeccable typeset`** — prose measure on `/data`, `/security`, `/pricing`; 11 px floor.
6. **[P3] `/impeccable extract`** — hexes → Tailwind tokens; delete Inter; record the three
   intentional detector ignores.
7. **`/impeccable polish`** as the final pass, then re-run `npx impeccable detect` on the five
   public URLs at both viewports and paste the counts into the change's tasks.

---

## Part 2 — Design critique (`impeccable critique`)

Method: dual-agent — Assessment A (design review) ran as an isolated agent reading `PRODUCT.md`,
`DESIGN.md` and the source with no detector output; Assessment B is the detector evidence in Part 1.
Synthesis is this section. (Degraded only in that B ran before A in the parent; see banner.)

### Design specificity verdict — specific at the core, generic at the edges

The three things that carry the interface could not be lifted into another product: the
right-anchored timeline padded with empties, the verdict sentence as prose with the field name in
`<code>`, and the evidence-is-mono discipline. The landing hero (a real FAIL card, not a
screenshot) is authored for this product. Auth, Pricing, Data, Security are competent dark-shadcn
pages — acceptable. **Specificity fails where it matters most:** Check detail opens with a generic
"entity header + action buttons + settings cards" composition (`CheckDetail.jsx:105-215`) and the
sentence the product is named for first appears in Run history at line 218, five cards down.

### Design Health Score (Nielsen)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | A failed load renders "Loading…" forever (`Dashboard.jsx:17-19,43-45`; `CheckDetail.jsx:29-31,86-92`); nothing says how fresh the last run is |
| 2 | Match system / real world | 3 | Form jargon: "Newest-record key", "JSON path to array", "Growth mode"; "every 28 h" explained only by a hover title |
| 3 | User control and freedom | 2 | No undo; delete and account-delete are one `window.confirm`; run sheet has no Esc/focus trap; filters have no reset; snooze menu closes only on `onMouseLeave` |
| 4 | Consistency and standards | 2 | Same form mixes real labels (Expectations) and placeholder-only inputs (Destination); three destructive treatments; "Last 30 runs" hardcoded on detail, dynamic on public; hero breaks the Two-Meaning Rule (`Landing.jsx:107` — emerald on a field that *disappeared*) |
| 5 | Error prevention | 2 | Secrets typed into `type="text"`; Enable-public has no confirm while Disable does; URL `?apikey=` printed back; growth+min 1 defaults make a steady table FAIL from run two |
| 6 | Recognition rather than recall | 2 | Placeholder labels vanish on typing; rename pencil is hover-only; "email … from the check page" is a memory bridge; `?wait=30` only on the landing page |
| 7 | Flexibility and efficiency | 2 | Copy buttons, filters, Run now; no deep link from a dashboard row to its latest run |
| 8 | Aesthetic and minimalist | 3 | Genuinely restrained; but detail permanently shows three code blocks and two setup cards above the verdicts |
| 9 | Error recovery | 2 | Load failures silent; `remove()` has no catch; clipboard failure swallowed; `PublicStatus.jsx:19-20` is the one good pattern |
| 10 | Help and documentation | 2 | Good inline hints; no link from the app to `docs/n8n.md` etc.; platform tabs only on landing |
| | **Total** | **23/40** | **Acceptable** |

### Cognitive load — 4 of 8 checklist failures, concentrated on Check detail and New Check

Single focus (detail: five-target header, seven cards, three filters, verdicts last); chunking
(Webhook card = three code blocks + three Copy buttons; RunPanel stacks eight sections); visual
hierarchy (name is the H1, badge 11 px, sentence below the fold); minimal choices (run filters
offer 10 options in one row; New Check shows ~14 controls on one screen).

### Emotional journey

- **Landing peak is real** — the strikethrough "Done" and the verbatim FAIL card; the origin story is the trust beat.
- **First PASS on an empty account** ends on *one green square after 29 grey ones and an 11 px badge*; the sentence is five cards down. Peak-end fails at the end of onboarding.
- **First FAIL at 2 am**: the dashboard row turns red but carries no sentence — the list API returns `id, verdict, timestamp` only (`worker/src/routes.ts:144`). Once reached, the sheet is the product's best moment (verdict, "workflow claimed N", Diff vs last PASS). After reading it there is no next step: no link to the destination, no snooze beside the verdict.
- **Recovery has no moment**: the badge flips back; nothing marks the run that recovered, though the alert copy promises "again on recovery".

### Where the two assessments agree, and where each saw more

Both flagged hue-only verdicts, placeholder-only labels, the unmasked URL, the non-dialog sheet
and the muted-grey contrast. The detector alone caught the Inter request, line measure on
`/data`/`/security`, 10 px labels and the 390 px edge collision. The review alone caught the
buried sentence, the missing `diff_message` in the list API, silent load failures, the hardcoded
"HTTP / JSON check" on the public page (`PublicStatus.jsx:62`), the client-facing internal check
name, the Two-Meaning Rule broken on the hero, and the Enable/Disable confirm asymmetry.

### Priority issues (synthesised)

1. **[P1] Verdict hue-only** — timeline squares, health-strip dots. Chosen fix (review's proposal): FAIL squares become a **ring** (`background: transparent; box-shadow: inset 0 0 0 3px #EF4444`) so PASS is solid and FAIL is hollow — survives greyscale by shape *and* luminance; `aria-label` per square; health dots become glyph tiles. The landing's static strip inherits it.
2. **[P1] The sentence is buried where it is the answer** — add `diff_message` to the newest `recent_runs` row in `listChecks`, render it under the name on each dashboard row; on detail, a "Latest verdict" block under the H1 (badge, full sentence, "12 min ago · webhook"), and once a run exists, Webhook + Destination move below Run history or into a Setup disclosure.
3. **[P1] Destination URL unmasked** — mask query values server-side (`url` in the sanitised config); host + path in the row, full masked URL behind Copy.
4. **[P1] Timeline does not survive narrow widths** — `Timeline.jsx:6` has no `shrink-0`/wrap; the dashboard hides it below `sm`, the public page compresses it. `shrink-0` + right-anchored `overflow-x-auto` container; dashboard shows the last 10 below `sm`.
5. **[P1] Failed load ≡ slow load** — copy the `PublicStatus` error pattern to Dashboard and CheckDetail (404 → "This check doesn't exist or was deleted."; other → "Could not reach VerifyRuns. Retrying in 10 s." + Retry).
6. **[P1] Labels** — visible `<label for>` for every Destination input, alert-channel input, and the three filters; secrets as `type="password"` with reveal.
7. **[P2] Public page**: connector label from `data.connector_kind`; "as of" freshness line with timezone; long names `break-words`; decide whether the H1 is the internal name (see questions).
8. **[P2] Hero Two-Meaning Rule** — `Landing.jsx:107` `price` in emerald inside a FAIL sentence → `text-zinc-100`.
9. **[P2] Muted grey → AA** (token change), 10 px → 11 px, prose measure on `/data`/`/security`/`/pricing`.
10. **[P3] Inter link; hard-coded hexes → tokens; detector ignores recorded; "Last 30 runs" dynamic; in-app curl gains `?wait=30`; DiffRow hue vs verdict in `steady` mode; snooze menu touch-close; rename affordance visible on touch.**

### Persona red flags (kept verbatim in spirit)

*Agency operator handing a status page to a client:* wrong connector label; internal check name
as the H1; verdict sentences name destination fields and go public for 30 runs behind a one-click
Enable (Disable confirms, Enable does not); no "as of" line; viewer-local timestamps with no
zone; the card copy says "teammates", `PRODUCT.md` says clients — the surface has not decided
who it is for.

*Solo operator on a phone at 2 am:* no timeline and no sentence on the dashboard row; 16 px
squares under 44 pt; Delete beside Snooze and Run at thumb height behind one confirm; Snooze
offers only 1 h / 24 h; FAIL badge ≈ 3.6:1 at 11 px; focus ring is 3 % white — invisible.

### Questions to decide (not answered by this pass)

1. If "the sentence is the product", should the latest verdict sentence be the H1 of Check detail and the check name the eyebrow?
2. Is "newest on the right, always" worth a first success looking like 29 absences — or should an early timeline show only what it has, right-aligned, with the empties faded further?
3. The public page is a client hand-off *and* a teammate debugging link. Which is it — and if clients, what does the operator control (display name, which fields appear in sentences) before pressing Enable?

These are recorded as Open Questions in `openspec/changes/design-pass/design.md`; the tasks
that depend on them are marked and the rest can proceed.
