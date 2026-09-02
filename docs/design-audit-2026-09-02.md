# Design audit — 2026-09-02 (consistency: public pages, then logged-in surfaces)

Method: source read of every public route (`frontend/src/pages/{Landing,Pricing,DataPage,
SecurityPage,LegalPage,PrivacyPage,TermsPage,AuthPage,ForgotPage,ResetPage,NotFound,PublicStatus}.jsx`,
`components/Nav.jsx`, `index.css`, `tailwind.config.js`, `public/index.html`) plus a live pass on
verifyruns.pages.dev in Edge, logged out, at a 1720 px CSS viewport and at the narrowest width Edge
would give (**492 px CSS**, not 390: Edge enforces a 500 px minimum window and the site's
`frame-ancestors 'none'` blocks an in-page 390 px iframe, so the phone numbers below are 492 px
numbers). `/status/:token` was reviewed from source only, as on 08-29: no token was available
logged out and enabling one is an account-state change this pass did not make.

Part 2 (same day, after Farjad logged in) covers the logged-in surfaces: `Dashboard.jsx`,
`NewCheck.jsx`, `CheckDetail.jsx` (including the run sheet and the setup disclosure),
`components/Timeline.jsx`, `components/CopyButton.jsx`, walked live on the dogfood account at
1720 px and 492 px. The walk was read-only: no run was triggered, nothing was created, renamed,
snoozed, enabled or deleted. Both checks on the account are HTTP / JSON, so the Airtable and
Postgres variants of the Destination card and the create form were reviewed from source only.

Scope was set by Farjad: the homepage and every public page, prompted by "lack of consistency in
some pages in footer and other", then extended to the logged-in pages. This is an assessment, not
a change: nothing was edited, no OpenSpec change was opened. Design authority: `DESIGN.md` and
`PRODUCT.md`. Previous audit: `docs/design-audit-2026-08-29.md`; the delta from it is recorded at
the end.

---

## Verdict

The pages share one visual system (the same nav, tokens, type ramp and card) and read as one
product above the fold. They stop agreeing below the fold: **only the landing page has a footer**.
Every other public page ends with an ad-hoc closing line, and no two of those lines link to the
same set of pages. The rest of the findings are the same pattern at smaller scale: two nav
implementations, two heading conventions, three link treatments, two dating conventions, a
hard-coded version string. None of it is systemic drift in the design language; it is the absence
of one shared page shell below the nav.

Health, on the 08-29 scale (consistency only, other dimensions unchanged since that audit):

| Dimension | 08-29 | 09-02 | Note |
|---|---|---|---|
| Consistency and standards (public pages) | 2 | **2** | Above-the-fold coherent; below-the-fold improvised per page |

## Findings

### [P1] The footer exists on exactly one page

`Landing.jsx:228-240` is the only `<footer>` in the app. It carries the wordmark, five links
(Pricing, What we store, Security, Privacy, Terms) and `v0.2`. Every other public page ends
differently:

| Page | How it ends | Links to Privacy / Terms? |
|---|---|---|
| `/` | Real footer, `max-w-6xl`, `Landing.jsx:228-240` | yes |
| `/pricing` | Two prose notes; one inline "What we store" link, `Pricing.jsx:81-88` | **no** |
| `/data` | Self-hosting sentence with "Pricing · Security · Privacy · Terms" appended, `DataPage.jsx:51-53` | yes |
| `/security` | "See also What we store and Pricing. Self-hosters: …", `SecurityPage.jsx:51-53` | **no** |
| `/privacy`, `/terms` | "Privacy · Terms · What we store · Security" including a self-link, no Pricing, `LegalPage.jsx:31-33` | yes |
| `/login`, `/signup`, `/forgot`, `/reset` | Nothing after the form; signup has an inline Terms/Privacy note only, `AuthPage.jsx:101-103` | signup only |
| `/nope` (404) | Nothing, `NotFound.jsx` | no |
| `/status/:token` | One centred "Read-only status page powered by VerifyRuns.", `PublicStatus.jsx:131-133` | no |

Consequences, in order of weight:

- **Pricing, the one page about charging, cannot reach Terms.** A visitor deciding whether
  "I'd pay for Pro" commits them to anything has no path to the terms from that page.
- **Four link orders across five pages.** Landing: Pricing, Data, Security, Privacy, Terms.
  Data: Pricing, Security, Privacy, Terms. Legal: Privacy, Terms, Data, Security. Security: Data,
  Pricing. Muscle memory never forms.
- **Two of the closing lines are sentences, not navigation.** On `/data` and `/security` the
  links are appended to a self-hosting note in `text-sm text-quiet`, so the page's only way
  onward reads as a footnote.
- **Auth pages are dead ends.** The only exits are the nav and, on signup, the fine-print Terms
  link.

Fix: one `Footer` component rendered by every public page, in the nav's `max-w-6xl` container
(the nav and footer are site chrome; the content columns vary `3xl` / `4xl` / `5xl` per page and
should keep doing so), with one link order. A slim variant for `/status/:token` that keeps the
"powered by" line but adds Privacy and Terms, since that page is handed to people who never
visit `/`. Keep the `docs/*.md` pointers on `/data` and `/security` as body text; they are content,
not chrome.

### [P2] Two nav implementations, and no current-page state

`PublicStatus.jsx:77-87` hand-copies the markup of `Nav.jsx` (same logo tile, same wordmark,
same blur header) at `max-w-4xl` instead of the nav's `max-w-6xl`, so the logo sits at a
different x on the status page than everywhere else. The copy is deliberate in that the status
page must not show account controls, but it will drift the first time `Nav.jsx` changes.
Fix: give `Nav` a `variant="public"` (or `minimal`) prop that swaps the right-hand slot for the
"Public status" label, and delete the copy.

`Nav.jsx:44-45` always renders "Log in" and "Get started" when logged out, so on `/login` the nav
shows a "Log in" link to the page you are on, and on `/signup` the primary button is a self-link.
Not a defect users will report, but it is the same class of thing as the footer: the shell does
not know which page it is on. Fix: hide or de-emphasise the link that matches the current route.

### [P2] Pricing layout bug (screenshot-confirmed at 1720 px; gap-only at 492 px)

`Pricing.jsx:62`: the `<li className="flex gap-2">` has three flex children (the check icon, a
bare text node, and the `(planned)` span). Flexbox lays the bare text and the span out as
separate items, so at desktop card width "(planned)" is pushed to the right edge of the card and
"history" orphans onto a second line under "3 Checks · 30 runs". At 492 px the card is wide
enough that only the extra gap shows. Only the Free card is affected because only the Free card
has the span. Fix: wrap the text in a `<span>` so each `<li>` has exactly two flex children,
icon and label.

### [P2] Legal pages missed the 65 ch measure fix

`LegalPage.jsx:14` (the lede) and `:21` (body paragraphs) carry no `max-w-[65ch]`; they run the
full `max-w-3xl` column, roughly 85 characters at 18 px, which is what the 08-29 audit flagged on
`/data` and `/security` and the `design-pass` change fixed there. The legal pages landed after
that pass and did not inherit it. Visible on `/privacy` at 1720 px: the lede runs edge to edge of
the column. Fix: same `max-w-[65ch]` as `DataPage.jsx:40` and `SecurityPage.jsx:28`.

### [P3] Section headings are paragraphs on exactly the prose pages

`LegalPage.jsx:19`, `DataPage.jsx:46`, `SecurityPage.jsx:34,40` render section titles as
`<p className="font-display text-xl">`; `Landing.jsx` uses `<h2>` for the same visual role. The
pages with the most headings therefore have an outline of one `<h1>` and nothing else, so a
screen-reader heading list and a browser's reader mode see a flat page. Fix: `<h2>` with the
same classes; nothing visual changes.

### [P3] Title punctuation leaks into the browser tab on the legal pages

`LegalPage.jsx:7` passes the H1 string straight into `useTitle(title)`, and the legal H1s end in
a full stop ("Privacy policy.", "Terms of service."), so the tab reads "Privacy policy. —
VerifyRuns" (observed). Pricing, Data and Security pass their own stop-free strings
(`Pricing.jsx:11`, `DataPage.jsx:33`, `SecurityPage.jsx:21`) and are fine. Fix: give `LegalPage`
a separate `pageTitle` prop, or strip the trailing stop in `useTitle`. The stop itself is house
style (the landing H2s use it too) and should stay in the H1.

### [P3] Two dating conventions, and one is already stale

`/privacy` and `/terms` carry a mono "Last updated 2026-08-29" line (`LegalPage.jsx:15`). `/data`
and `/security` say "true as of August 2026" inside the lede (`DataPage.jsx:41`,
`SecurityPage.jsx:29`). Today is 2 September 2026, so the prose version already reads as last
month's page while the content is current. Fix: the same mono "Last updated" line on all four,
sourced from one place (the docs they restate carry their own dates).

### [P3] `v0.2` is hand-typed

`Landing.jsx:237` prints `v0.2`; `frontend/package.json` and `worker/package.json` both say
`0.1.0`. Either source the string from the build (`REACT_APP_VERSION` from `package.json` at
build time) or drop it: a version that is only on one page and disagrees with the manifests is
noise. If the footer becomes shared, decide this before it is copied to every page.

### [P3] Three inline-link treatments on public pages

- `underline underline-offset-4 hover:text-zinc-300` (18 sites; legal, data, security, pricing,
  status, and the mailto links).
- Footer links with no underline and `hover:text-zinc-300` (`Landing.jsx:232-236`).
- `.rp-link` (nav, 404 "VerifyRuns home"): `#A1A1AA` to `#FAFAFA` on hover, no underline.
- Plus `hover:text-white` on the auth switch links (3 sites) and bare `underline
  underline-offset-4` with no hover (6 sites in legal body copy).

`index.css` sets no global `a` rule. Tailwind's preflight makes anchors inherit colour and
decoration, so an anchor without classes does not go blue; it goes invisible, indistinguishable
from the body text around it (the bare-underline legal links are one class away from that).
Fix: one `.rp-link` for chrome and one prose-link rule (underline, offset, hover step) in
`index.css`, applied by a class the prose pages share rather than repeated inline.

### Observed, not verdicts

- **Hero at 1720 px:** the hard `<br />` at `Landing.jsx:82` was placed for the case where the
  first clause fits on one line. In the `1.1fr` column at this width "Your automation said"
  already wraps, so "Done." sits alone on line two and the headline runs four lines. Worth a
  look at the widths you actually design for; at 492 px it reads as intended.
- **Hero strip clipped:** the static 30-square strip (`Landing.jsx:111-117`) is wider than the
  card, and the `tl-scroller` starts scrolled to the right by design, so the leftmost visible
  square is half-cut at the card edge. Correct behaviour per DESIGN.md (newest always in view)
  but it reads as a rendering glitch on the one static, decorative instance. A `mask-image` fade
  on the left edge would make the cut look intentional.
- **404 primary action** is "Go to dashboard" (`NotFound.jsx:19`), which for a logged-out
  visitor bounces through `/login`. Choosing the CTA by auth state would match the nav.
- **Nav and content columns differ on purpose.** Nav and footer at `6xl`; landing sections at
  `5xl` / `3xl`; pricing at `5xl`; data, security, legal at `3xl`; status at `4xl`. This is fine
  as long as the chrome is consistent with itself, which is the point of the P1 fix.

### Questions, not findings

1. The Pro card's emerald border (`Pricing.jsx:57`, `border-emerald-500/40`) against DESIGN.md's
   "status hues mean verdicts" rule. It is the only non-verdict use of emerald as an outline.
   Intentional "recommended" marker, or leftover?
2. `/data` and `/security` cite `docs/self-hosting.md` and `docs/security.md` in `<code>` but do
   not link them. The repo is on GitHub (`farjad-hasan/verifyruns`); if it is public, link them;
   if it is private, the sentence promises a file the reader cannot open.
3. Should the shared footer carry the wordmark as the logo tile (as the nav does) or as plain
   text (as the landing footer does today)? Today's footer is the only place the wordmark appears
   without its tile.

## Not verified (Part 1)

- `/status/:token` live rendering (no token available logged out; source review only).
- Phone width below 492 px CSS. See Method.

---

# Part 2 — Logged-in surfaces

## Verdict

The app pages are more consistent with each other than the public pages are: one nav, one card,
one label style, the timeline reused identically on the dashboard row, the state card and the
public page. The 08-29 P1s are visibly fixed (FAIL is a ring, the sentence leads the state card
and appears on the dashboard row, the run sheet is a Radix dialog that closes on Escape (focus
return not exercised: the sheet was opened programmatically), the setup cards collapse behind a
disclosure once a run exists, the destination URL is masked). What remains is again a shell problem plus a handful of "the same thing, two
ways" cases between the create form and the detail page, and one real defect on the surface the
product is built for: the run history row at phone width.

## Findings

### [P1] Run history rows collapse at phone width

`CheckDetail.jsx:167-173`: each row is `flex items-center gap-5` with four children: badge,
sentence, timestamp (`whitespace-nowrap`), trigger. At 492 px the timestamp and trigger keep
their full width, so the sentence is squeezed into a column about 12 characters wide and a
one-line verdict runs to six or seven lines ("Run reported / success, but / your workflow / said
it wrote 3 / records; the / destination / gained 0."). Screenshot-confirmed. This is the list a
solo operator reads on a phone after the 2 am alert (PRODUCT.md's smallest case). Fix: below
`sm`, stack the row (badge + sentence on top, timestamp · trigger as one mono line beneath), or
drop `whitespace-nowrap` and let the sentence keep `flex-1` with a minimum measure. The same
markup is copied in `PublicStatus.jsx:121-125` and will behave the same way (source only, not
screenshot-confirmed).

### [P1] The detail header does not stack at phone width

`CheckDetail.jsx:264-282`: the header is `flex flex-wrap items-start justify-between` with the
title block `min-w-0 flex-1` and three buttons (Snooze, Run check now, Delete) in a sibling.
At 492 px the buttons fit on one line and win, so the title block is squeezed to the left gutter:
the eyebrow "HTTP / JSON CHECK" wraps to three lines and the H1 to three. Screenshot-confirmed.
Fix: `flex-col sm:flex-row`, actions below the title on phones. While there, Delete sits in the
same row as Run at thumb height, still behind one `window.confirm` (`:115`), unchanged since
08-29 (Nielsen #3 / #5 in that audit).

### [P2] Timeline squares are buttons inside a button

`Dashboard.jsx:66` wraps the whole row in a `<button>`; `Timeline.jsx:22-31` renders each run as
a `<button>`, and both strips (`:89-95`) render inside the row. Live DOM: the dogfood row contains
22 nested buttons. Interactive content inside `<button>` is invalid HTML; assistive tech announces
23 buttons per row and keyboard users tab through every square before reaching the next check.
The inner squares have no `onRunClick` on the dashboard, so they are decorative there. The same
row also nests three `<p>` elements, and `CheckNameHeader` (`CheckDetail.jsx:973-987`) puts the
page `<h1>` inside a `<button>`: flow content inside a button, the same validity class. Fix:
`Timeline` takes a `static` prop that renders `<span>`s (the landing hero already hand-rolls
exactly that), and the dashboard row becomes a `<Link>` or an `<a>` so the whole card is one
target.

### [P2] Product noun capitalised on marketing and the dashboard, lower-case in the app

PRODUCT.md fixes the term as **Check**. Marketing and the dashboard follow it: "3 Checks", "Create
a Check" (`Landing.jsx:175`, `Dashboard.jsx:121`), "Your Checks" (`Dashboard.jsx:39`). The
create and detail pages do not: "Create a check" (`NewCheck.jsx:98`), "Create check" (`:265`),
"New check" (`Dashboard.jsx:43`), "Run check now" (`CheckDetail.jsx:276`), "Delete this check"
(`:115`), "HTTP / JSON check" eyebrow (`:267`), "this check's name" (`:853`). Pick one; the
PRODUCT.md spelling is the recorded decision.

### [P2] The same control differs between the create form and the edit form

- **Growth mode select**: create offers one-word options ("Growth", "Steady", "Claimed") with the
  explanation as a hint below (`NewCheck.jsx:198-202`); edit offers full-sentence options
  ("Growth — must gain at least the minimum (or what the workflow claims)") with no hint
  (`CheckDetail.jsx:700-702`).
- **Heartbeat label**: "Expect a run every … hours (blank = off)" on create (`NewCheck.jsx:222`);
  "Heartbeat — expect a run every … hours (blank = off)" on edit (`CheckDetail.jsx:685`).
- **Labels**: every create-form label carries `htmlFor` and the input an `id` (`NewCheck.jsx`
  `Field`, `:133-146`); none of the five edit-form labels do (`CheckDetail.jsx:685,698,706,717,
  728`), so the 08-29 "placeholder-only labels" fix reached one form and not the other.
- **Min new records default**: the create form starts at 0 (`NewCheck.jsx:29`); the edit form
  and the read-only card fall back to 1 when the value is absent (`CheckDetail.jsx:617,626,678`).
  Only matters for a Check with no `expectations`, but the two disagree about what "unset" means.

Fix: one `ExpectationsFields` component used by both, with the create form's labels and hints.

### [P2] Card-header actions use four button styles on one page

On Check detail: Copy is ghost-xs (`CopyButton.jsx`), Edit is ghost-xs (`CheckDetail.jsx:664`),
Enable is **primary**-xs (`:891`), Disable is danger (`:887`), Add is primary-regular (`:606`),
Remove is a bare `rp-link` in `text-xs` (`:580`), Delete is danger-regular (`:278`). Enable is
the one card-header action that is filled white, which makes "make this Check public" the most
prominent control on a page whose primary action is reading the verdict. Fix: card-header actions
are ghost-xs (Copy, Edit, Enable); destructive ones are danger-xs (Disable, Remove); the two
regular-size buttons stay in the page header and in forms.

### [P3] Two empty states for the same condition, in two typefaces

On a Check with no runs the state card says "No runs yet. Trigger your workflow, or click “Run
check now”." in **mono** (`CheckDetail.jsx:310`) and, further down the same page, the run
history card says "No runs yet. Verdicts will show up here after your workflow posts to the
webhook." in Manrope (`:158`). DESIGN.md's rule is "every sentence the product speaks in
Manrope"; the same rule is broken by the mono "Loading…" (`:136`, `Dashboard.jsx:49`,
`App.js:25`) and by `PublicStatus.jsx:103` "No runs recorded yet.". Fix: sentences in Manrope,
mono only for observed values; one empty-state sentence per page.

### [P3] Section headings are paragraphs here too

`NewCheck.jsx:328` (`Section`), and every card title on Check detail (`:188,216,566,661,884`) are
`<p className="font-display text-lg">`. Same finding as the public pages, same fix: `<h2>`.

### [P3] "RUN HISTORY" label wraps beside the filters at phone width

`CheckDetail.jsx:151-154`: the label and three selects share one `flex items-center
justify-between` row; at 492 px the selects take the width and the label breaks into two lines.
Fix: `flex-wrap` with the filters on their own line below `sm`.

### Observed, not verdicts

- **No footer on any app page.** Dashboard ends at the last row (page height 925 px at 1720 px,
  so it does not even fill the viewport); Check detail ends at the setup disclosure. Same shell
  gap as Part 1; a slim app footer (Privacy · Terms · What we store · Security) belongs in the
  same change.
- **Delete-account in the global nav** (`Nav.jsx:38`) is now 44 px and labelled, as 08-29 asked,
  but is still a one-`confirm` account wipe one icon away from Sign out on every app page.
- **Timestamps are absolute in run history and relative in the state card** ("15 h ago" vs
  "9/1/2026, 1:45:51 PM"). Defensible (one is a headline, one is a log), but the log's
  `toLocaleString` format is verbose for a 30-row list; a shorter date form would give the
  sentence its width back at every size.
- **Retries appear as separate rows** with trigger "RETRY" beside the webhook run they retried.
  Nothing in the row links the two; a reader has to infer the pairing from timestamps.
- **The dashboard row truncates the name** (`truncate`) while the detail H1 wraps
  (`break-words`). At 492 px the dogfood name shows as "brand-brief → Supabase b…" on the
  dashboard and three full lines on detail. Fine, but note it when naming Checks.
- **Airtable / Postgres branches not walked live** (no such Check on the account).

## Not verified (Part 2)

- Airtable and Postgres Destination cards and create-form branches (source only).
- The run sheet at phone width (it is `w-full` below `sm` by class; not screenshot-confirmed).
- Snooze menu, rename, expectations edit, channel add/remove, public enable: not exercised, to
  keep the walk read-only. Their markup was reviewed from source.

## Delta from 2026-08-29 (confirmed live)

- Inter is gone from `public/index.html` (0 matches).
- `max-w-[65ch]` is on the `/data`, `/security` and `/pricing` ledes and body text.
- The landing card tags are 11 px (`text-[11px]`, `Landing.jsx:141`).
- No horizontal overflow on `/`, `/pricing`, `/security` at 492 px (`scrollWidth ==
  innerWidth`); the landing footer wraps to two rows cleanly (121 px tall).
- Hard-coded hexes: the public pages now use `border-hairline`, `bg-ink-alt`, `text-quiet`;
  none of the `border-[#27272A]` sites from 08-29 remain in the files read here.
- Logged in: FAIL squares render as rings; the latest sentence leads the state card and appears
  under the name on each dashboard row; the run sheet is `role="dialog"` and closes on Escape
  (focus return not exercised); the setup cards sit behind a disclosure once a run exists; the destination URL
  shows masked query values; the dashboard shows a 10-square strip below `sm`; the nav's
  delete-account control is 44 px with an `aria-label`; secrets on the create form are
  `type="password"` with a reveal toggle and every create-form field has a visible label.

## Proposed changes (for OpenSpec, not opened here)

1. `public-page-shell`: a `Footer` component rendered by every route, public and app, with one
   link order (Pricing · What we store · Security · Privacy · Terms), a `Nav` variant that
   replaces the status page's hand copy, current-route awareness in `Nav`, and the one-line
   fixes above that touch the same files (`Pricing.jsx:62` flex wrap, `LegalPage.jsx` measure,
   `<h2>` on prose pages and card titles, `LegalPage` tab title). The version string and the
   dating convention are decisions to record in `design.md` before the footer is copied
   everywhere. Impact: the page files named in Part 1 plus `components/Nav.jsx`, a new
   `components/Footer.jsx`, and `index.css` for the link rule.
2. `check-detail-phone`: the two P1s and the P2s from Part 2 that live in `CheckDetail.jsx`,
   `Dashboard.jsx`, `Timeline.jsx` and `PublicStatus.jsx`: stacked run rows and header below
   `sm`, a static `Timeline` for the dashboard row, one `ExpectationsFields` component shared
   with `NewCheck.jsx`, the card-header button rule, the empty-state sentence in Manrope, and the
   "Check" spelling. Sequential with (1) only where `PublicStatus.jsx` is touched by both.
