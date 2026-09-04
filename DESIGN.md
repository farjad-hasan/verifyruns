---
name: VerifyRuns
description: A dark, flat, Swiss-leaning developer tool where a plain-English verdict and a strip of thirty squares carry the whole interface.
colors:
  ink-black: "#0A0A0A"
  ink-black-alt: "#0C0C0E"
  surface-panel: "#121214"
  surface-raised: "#18181B"
  code-black: "#000000"
  hairline: "#27272A"
  timeline-empty: "#1C1C1F"
  hairline-hover: "#3F3F46"
  hairline-section: "#18181B"
  hairline-faint: "rgba(255,255,255,0.05)"
  text-primary: "#FAFAFA"
  text-secondary: "#A1A1AA"
  text-muted: "#8A8A93"
  text-placeholder: "#52525B"
  text-code: "#E4E4E7"
  verdict-pass: "#10B981"
  verdict-pass-wash: "rgba(16,185,129,0.1)"
  verdict-pass-edge: "rgba(16,185,129,0.25)"
  verdict-fail: "#EF4444"
  verdict-fail-wash: "rgba(239,68,68,0.1)"
  verdict-fail-edge: "rgba(239,68,68,0.25)"
  verdict-fail-soft: "#FCA5A5"
  snoozed-amber: "#FBBF24"
  focus-ring: "#52525B"
typography:
  display:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  lede:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.1em"
  badge:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  square: "3px"
  square-hero: "4px"
  control: "8px"
  panel: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.ink-black}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "#E4E4E7"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-raised}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.verdict-fail-soft}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-danger-hover:
    backgroundColor: "{colors.verdict-fail-wash}"
  button-ghost-xs:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    fontSize: "12px"
  button-danger-xs:
    backgroundColor: "transparent"
    textColor: "{colors.verdict-fail-soft}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    fontSize: "12px"
  card:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
    padding: "24px"
  input:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  badge-pass:
    backgroundColor: "{colors.verdict-pass-wash}"
    textColor: "{colors.verdict-pass}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  badge-fail:
    backgroundColor: "{colors.verdict-fail-wash}"
    textColor: "{colors.verdict-fail}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  timeline-square:
    backgroundColor: "{colors.timeline-empty}"
    rounded: "{rounded.square}"
    size: "12px"
  timeline-square-hero:
    backgroundColor: "{colors.timeline-empty}"
    rounded: "{rounded.square-hero}"
    size: "16px"
  code-block:
    backgroundColor: "{colors.code-black}"
    textColor: "{colors.text-code}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: "14px 16px"
---

# Design System: VerifyRuns

<!-- Extracted 2026-08-29 from frontend/src/index.css, tailwind.config.js and the page components.
     Supersedes design_guidelines.json (the Emergent-era brief); where that file and the code
     disagreed, the code won and the difference is noted under Do's and Don'ts. -->

## Overview

**Creative North Star: "The Verdict Slip"**

VerifyRuns looks like the receipt a careful engineer would print: near-black paper, one typeface
for the claim, one for the evidence, and a single row of thirty squares that says everything before
a word is read. The system is dark, flat and Swiss in temperament — solid surfaces, one-pixel
hairlines, generous whitespace, no gradients, no glass, no decoration that is not data. Colour is
rationed to two meanings: emerald means *landed*, red means *did not*. Everything else is a grey.

Density is low for a developer tool. Sections breathe (80 px vertical rhythm on marketing pages,
48 px on app pages), cards carry 24–32 px of internal padding, and headings are set tight
(`-0.02em`) in Outfit so they feel typeset rather than templated. Monospace is not a code-only
affordance here; it marks *evidence* — timestamps, connector names, webhook URLs, fingerprints,
the "newest →" caption — so the reader can always tell the product's claim from the product's proof.

**Key Characteristics:**
- Two-tone status vocabulary (emerald / red) on an otherwise achromatic zinc scale.
- The three faces are vendored (`frontend/src/fonts/`, SIL OFL, latin variable woff2) and served
  from the site's own origin; no page requests a font provider.
- Three faces with fixed jobs: Outfit for claims, Manrope for prose and UI, JetBrains Mono for
  evidence.
- Flat surfaces separated by hairlines; depth comes from tonal steps, never from shadow at rest.
- The 30-square timeline is the signature component and appears identically on every surface
  that shows runs.
- Motion is small and functional: a 160 ms colour transition, a 500 ms fade-up on entrance, a
  lift-and-glow on timeline hover.

## Colors

An achromatic zinc scale carries the whole interface; the only hues are the two verdicts and one
warning amber.

### Primary
- **Verdict Emerald** (`#10B981`): PASS. Timeline squares, badge text, the brand tile behind the
  Activity glyph, section eyebrows ("How it works"), the pulsing early-access dot, selection
  highlight. Used as a 10 % wash with a 25 % edge for badges and tabs — never as a filled button.
- **Verdict Red** (`#EF4444`): FAIL. Same treatment as emerald. `#FCA5A5` is its softened text
  form on the danger ghost button, and the landing hero FAIL card takes a `red-500/30` border.

### Neutral
- **Ink Black** (`#0A0A0A`): page ground, input ground, the nav bar at 80 % over blur.
- **Ink Black Alt** (`#0C0C0E`): alternating marketing sections, one tonal step up from ground.
- **Panel** (`#121214`): every card (`.rp-card`).
- **Raised** (`#18181B`): ghost-button hover, modal surfaces, section-divider hairline.
- **Code Black** (`#000000`): code and snippet blocks — the one place darker than the page.
- **Hairline** (`#27272A`): card borders and inputs. Hover state lifts to `#3F3F46`.
- **Timeline Ghost** (`#1C1C1F`): the empty timeline slot — one step above Panel so empties read
  as ground and real runs as figure.
- **Text** — Primary `#FAFAFA`, Secondary `#A1A1AA` (prose), Muted `#8A8A93` (captions,
  eyebrows, timestamps — 5.8:1 on Ink, 5.2:1 on Raised; was `#71717A`, which failed AA on
  every surface), Placeholder `#52525B` (exempt: never the only label), Code `#E4E4E7`.
- **Snoozed Amber** (`#FBBF24`, Tailwind `amber-400`): the only third hue, for a snoozed Check label.

### Named Rules
**The Quiet-But-Legible Rule.** Every grey a user is expected to read clears 4.5:1 on the surface
it sits on; quietness comes from size and weight, never from a darker grey.

**The Two-Meaning Rule.** Emerald and red mean PASS and FAIL and nothing else. Do not use emerald
for "primary action" or red for "delete" — the primary button is white, and danger is a red-*edged*
ghost so the filled reds stay reserved for verdicts.

**The Wash-Not-Fill Rule.** Status colour appears as a 10 % wash with a 20–25 % edge, except on the
timeline square, where it is the only solid fill in the system.

## Typography

**Display Font:** Outfit (with system-ui, sans-serif)
**Body Font:** Manrope (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace)

**Character:** Outfit's geometric, slightly wide letterforms at 600 with tight tracking read as a
confident claim; Manrope underneath is soft enough to make paragraphs comfortable on black; the
mono is deliberately small (12.5 px) so evidence reads as evidence, not as shouting.

### Hierarchy
- **Display** (600, `text-4xl sm:text-5xl`, 1.05): the landing hero and pricing H1 only. One
  size step below the original brief on purpose — it must hold three lines on desktop.
- **Headline** (600, `text-3xl sm:text-4xl`, 1.15): page titles ("Your Checks"), section H2s. A
  second clause in Muted grey (`text-zinc-500`) is the house move for a two-part heading.
- **Title** (400, `text-lg`–`text-xl`): card titles, check names, step titles. Outfit, regular weight.
- **Lede** (400, `text-lg`, 1.625, Secondary grey): the paragraph under a Display heading, max
  `max-w-xl` / `max-w-2xl`.
- **Body** (400, `text-sm`, 1.625, Secondary grey): all prose and UI copy.
- **Label** (400, `text-xs`, `tracking-widest`, uppercase, Muted grey): eyebrows above headings
  and captions above panels ("Last 30 runs"). Emerald when it introduces a positive section, red
  when it introduces the problem.
- **Badge** (600, 11 px, `0.06em`, uppercase): PASS / FAIL pills.
- **Mono** (400, 12.5 px, 1.6): timestamps, connector labels, URLs, snippets, "newest →",
  the version string, the attribution line.

### Named Rules
**The Evidence-Is-Mono Rule.** Anything the system *observed* — a timestamp, a count, a URL, a
field name, a fingerprint — is set in JetBrains Mono. Anything the system *says* is set in
Manrope. A verdict sentence is prose; the field name inside it is `<code>`.

**The Grey Second Clause Rule.** Headlines split into a claim and a consequence; the consequence
is set in `text-zinc-500` on its own line.

## Layout

Single centred column. Marketing pages use `max-w-6xl` (hero, footer) and `max-w-5xl` (sections),
`max-w-3xl` for the quote and CTA; app pages use `max-w-6xl`; the public status page `max-w-4xl`.
Horizontal padding is `px-6` rising to `lg:px-10`. Vertical rhythm is `py-20` (80 px) per marketing
section, `py-12` on the dashboard, `py-16` on the status page. Sections are separated by a
full-width `#18181B` hairline and alternate between Ink Black and Ink Black Alt.

Grids are 3-up on `md:` for feature cards and plans, 2-up for "who it's for", and a
`lg:grid-cols-[1.1fr_1fr]` split for the hero so the FAIL card sits beside the headline. Below `sm`
the dashboard hides each row's timeline; below `md` grids stack. The sticky nav is 30 z-index over
`bg-[#0A0A0A]/80 backdrop-blur-sm`.

Spacing steps observed: 4 / 8 / 12 / 16 / 24 / 32 / 40 px inside components; 24–32 px card
padding (`p-6` / `p-8`), 40–56 px for the educational empty state (`p-10 sm:p-14`).

## Elevation & Depth

Flat by tonal layering. Surfaces step `#0A0A0A → #0C0C0E → #121214 → #18181B` and are separated
by one-pixel hairlines; no surface carries a shadow at rest. Shadows exist only as *state*: a
coloured glow on a hovered timeline square, and a heavy ambient shadow reserved for modals.

### Shadow Vocabulary
- **Pass glow** (`box-shadow: 0 0 12px rgba(16,185,129,0.5)`): hovered PASS square.
- **Fail glow** (`box-shadow: 0 0 12px rgba(239,68,68,0.5)`): hovered FAIL square.
- **Ambient** (`0 4px 20px -2px rgba(0,0,0,0.5)`): modal / sheet surfaces only.
- **Focus** (`0 0 0 3px rgba(255,255,255,0.03)` + border `#52525B`): input focus.

### Named Rules
**The Flat-At-Rest Rule.** Nothing casts a shadow until the user touches it or a modal opens.
Depth is a tonal step and a hairline.

**The One Blur Rule.** `backdrop-blur` is permitted on the sticky nav and on modal scrims only;
nowhere else is content allowed to show through a surface.

## Shapes

Soft rectangles, three radii: 8 px for controls (buttons, inputs, code blocks), 12 px for panels
(cards), and 3–4 px for the timeline squares so they read as pixels rather than chips. Badges and
the early-access tag are full pills (999 px). Icon tiles are `rounded-md`/`rounded-lg` squares with
a status wash and edge. Borders are always 1 px. The landing hero carries a 48 px grid backdrop
(`.rp-grid`, 4 % white lines, radially masked) — the only decorative geometry in the system.

## Components

### Buttons
- **Shape:** softly rounded (8 px), `inline-flex`, 8 px icon gap, 14 px Manrope.
- **Primary:** white on black (`#FAFAFA` / `#0A0A0A`), 600 weight, `10px 18px`. Hover darkens to
  `#E4E4E7`; active nudges down 1 px; disabled 50 % opacity.
- **Ghost:** transparent with `#27272A` border, 500 weight; hover fills `#18181B` and lifts the
  border to `#3F3F46`. Also used at `!py-1.5 !px-3 !text-xs` as the Copy button.
- **Danger:** transparent, `#FCA5A5` text, `rgba(239,68,68,0.3)` border, `8px 14px`, 13 px;
  hover fills the red wash. Used for destructive actions on Check detail.
- **Transitions:** `background-color 160ms ease` (+ `border-color` on ghost, `transform` on
  primary). Never `transition: all`.

### Badges
- **PASS / FAIL:** pill, 11 px 600 uppercase `0.06em`, 10 % wash + 25 % edge in the verdict hue,
  `3px 10px`. Used inline next to titles, in run lists, and as `public-last-verdict`.
- **Early-access tag:** pill, emerald 5 % wash + 20 % edge, with a 6 px pulsing emerald dot.
- **Meta labels:** 10 px uppercase mono in Muted grey ("every 24 h", "Snoozed" in amber).

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** Panel `#121214`.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1 px Hairline; `hover:border-[#3F3F46]` when the whole card is a link (dashboard
  rows). The landing FAIL card and the recommended plan override the border with a status edge.
- **Internal Padding:** `p-6` default, `p-8` for feature/step cards, `p-10 sm:p-14` for the
  educational empty state, `p-5` for the health strip and list rows.
- **Lists inside cards:** `divide-y divide-[#27272A]` rows at `p-5`.

### Inputs / Fields
- **Style:** Ink Black ground, 1 px Hairline border, 8 px radius, `10px 12px`, 14 px Manrope,
  placeholder `#52525B`.
- **Focus:** border to `#52525B` and a 3 px 3 % white ring; 160 ms.
- **Error / Disabled:** not yet defined in CSS — currently inherit.

### Navigation
- **Style:** sticky, `#0A0A0A` at 80 % with backdrop blur, bottom hairline `#18181B`, `py-4`.
  Wordmark in Outfit 600 `text-lg` beside a 28 px emerald icon tile. Right side: ghost "Sign out"
  and a trash-icon link, or a muted "Log in" link plus primary "Get started".
- **Public status header:** same bar, plus a right-aligned 10 px uppercase mono "Public status".

### Code Blocks (`.mono-block`)
Code Black ground, Hairline border, 8 px radius, `14px 16px`, 12.5 px JetBrains Mono at 1.6 in
`#E4E4E7`, `pre-wrap` + `break-word`, horizontal scroll if needed. Setup tabs above it are small
ghost pills that take the emerald wash when selected.

### Timeline (signature component)
Thirty 12 px squares (16 px in `.tl-hero`) at 4 px gap, 3 px radius (4 px hero), left-padded with
ghost empties (`#1C1C1F`, one step above the panel) so the newest run is always the rightmost square. PASS fills emerald, FAIL
is a 3 px red ring (4 px in hero) on a transparent fill, so the verdict survives greyscale; each real square is a `<button>` with a `title` tooltip ("PASS · timestamp"). Hover
lifts 2 px, scales 1.15 and glows in its own hue, 140 ms. A "newest →" mono caption sits above it
on the status page. It appears on the landing FAIL card (static), every dashboard row (hidden
below `sm`), Check detail, and the public status page.

### State Card (Check detail)
The timeline card on Check detail leads with the latest verdict once a run exists: badge and mono
"12 min ago · webhook" on one line, the full sentence at `text-lg sm:text-xl` in Primary white at
a 70 ch measure (`text-wrap: pretty`, so the last word is never orphaned), a hairline, then the
"N of 30 runs" caption and the strip. The sentence is a button (opens the run sheet) with a
`raised` wash on hover and an inline mono "open run →" hint.

### Focus
One ring for every control: `outline: 2px solid #52525B; outline-offset: 3px; border-radius: 6px`
on `:focus-visible`, never the browser default. Inputs keep their border/box-shadow focus instead.

### Health Strip
A Panel card at `p-5` holding three stats — Passing (emerald), Failing (red), No runs yet (grey) —
each a 8 px dot, an Outfit `text-2xl` number and a 10 px uppercase label; "Auto-refresh · 10s" in
mono on the right.

### Educational Empty State
Panel at `p-10 sm:p-14`, emerald eyebrow "Get set up", Outfit headline, an ordered list of three
steps with mono `01 / 02 / 03` numerals in emerald, then one primary button. No sample data, ever.

## Do's and Don'ts

### Do:
- **Do** set every observed value — timestamps, counts, URLs, connector names, field names — in
  JetBrains Mono, and every sentence the product speaks in Manrope.
- **Do** keep the newest run on the right, padded with empties, on every timeline.
- **Do** give PASS / FAIL a second channel beyond hue (glyph, shape or luminance) wherever verdict
  colour appears — the squares, badges and health-strip dots currently rely on hue alone.
- **Do** separate surfaces with a 1 px hairline and a tonal step; alternate `#0A0A0A` /
  `#0C0C0E` for long marketing pages.
- **Do** use the grey second clause for two-part headlines and a coloured eyebrow above them.
- **Do** wrap verdict sentences in full; they are never truncated with an ellipsis.
- **Do** keep transitions specific (`background-color`, `border-color`, `transform`) at 140–160 ms
  and entrance fades at 500 ms with staggered `animationDelay`.
- **Do** keep `data-testid` on every interactive and key informational element.
- **Do** teach the 3-step setup in empty states.
- **Do** keep every colour behind a semantic token (`ink`, `panel`, `muted`, `verdict-pass`…):
  dark-only is the current look, not a commitment (PRODUCT.md, 2026-08-29), so components never
  hard-code a hex.
- **Do** render the empty timeline slots as ghost squares one tonal step above the panel
  (`#1C1C1F`), never as hairline-grey chips, so the real runs read as figure and the empties as
  ground; caption the strip "N of 30 runs" while N < 30.
- **Do** size every card-header action as `rp-btn-xs` (6 × 12 px, 12 px type): ghost for Copy,
  Edit, Enable and Rename; danger for Disable and Remove. Filled primary buttons belong to page
  headers, forms and empty states, never to a card header (added 2026-09-03, `check-detail-phone`).
- **Do** set every sentence the product speaks — "Loading…", empty states, hints — in Manrope;
  JetBrains Mono is for observed values only, and a page shows one empty-state sentence per
  condition, not two (2026-09-03).
- **Do** stack verdict rows and page headers below `sm` (640 px): badge + sentence, then
  timestamp · trigger on one mono line; actions on their own row under the name. The sentence
  never yields width to its metadata (2026-09-03).
- **Do** keep interactive content out of links and buttons: a dashboard row is one `<Link>`, and
  the strip inside it is `Timeline` in `static` mode (spans, `role="img"`), never buttons in a
  button (2026-09-03).
- **Do** end every route with the shared `Footer` (logo, wordmark, Pricing · What we store ·
  Security · Privacy · Terms) in the nav's `max-w-6xl` width, and give `/status/:token` its slim
  variant; never hand-write a closing link line on a page (2026-09-03, `public-page-shell`).
- **Do** style inline links in prose with `.rp-inline` (underline, 4 px offset, brighter on hover
  by a relative filter so the link keeps its own hue) and chrome links with `.rp-link`; no ad-hoc
  utility strings on anchors (2026-09-03).
- **Do** keep documentation pages (`/data`, `/security`, `/privacy`, `/terms`) at a 65 ch measure
  with `<h2>` sections and one mono "Last updated" line under the lede (2026-09-03).

### Don't:
- **Don't** load Inter. `public/index.html` still requests it (line 10) — a leftover from the
  scaffold; the system is Outfit / Manrope / JetBrains Mono.
- **Don't** use gradients on dark surfaces, glassmorphism, or translucent panels with content
  scrolling beneath (the nav's blur is the single exception).
- **Don't** fill a button with emerald or red; the primary is white and status hues mean verdicts.
- **Don't** cast shadows at rest. Glow only on hover, ambient only on modals.
- **Don't** nest cards inside cards; a list inside a card uses `divide-y` rows, not inner panels.
- **Don't** use emoji as icons; use Lucide, and prefer tech metaphors (Activity, ShieldCheck,
  Zap, Eye, Globe).
- **Don't** seed empty states or examples with fake customers, logos or numbers.
- **Don't** apply `transition: all`, bounce / elastic easing, or centre the whole app container.
- **Don't** re-litigate the five recorded detector exceptions in `.impeccable/config.json`
  (`kicker-above-heading` — the Label eyebrow is this system's section voice on marketing pages
  and is gone from app pages; `pulsing-dot` — the one early-access badge; `tight-leading` — the
  display H1; `codex-grid-background` — the masked hero grid; `layout-transition` — sonner's
  toast CSS, third-party). Everything else the detector reports is a defect.
- **Don't** follow `design_guidelines.json`'s `rounded-none md:rounded-lg` — the shipped system
  is 8 / 12 px everywhere and that file is retired.
