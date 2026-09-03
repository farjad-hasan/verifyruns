## Why

On a phone, the Check detail page — the surface a solo operator opens after the 2 am FAIL alert
(PRODUCT.md's smallest case) — squeezes every verdict sentence in Run history into a column about
twelve characters wide, so a one-line verdict runs to six or seven lines, and the page header lets
the three action buttons win the row so the Check name wraps into the left gutter three lines deep.
Both were screenshot-confirmed on the dogfood account at 492 px on 2026-09-02
(`docs/design-audit-2026-09-02.md`, Part 2). Around them the app pages disagree with themselves in
smaller ways: the dashboard row is a `<button>` holding 22 nested `<button>`s (the timeline
squares), the create form and the Expectations editor render the same fields with different
labels, options and defaults, one page uses four button styles for card-header actions, two empty
states describe the same condition in two typefaces, and the product noun is "Check" on marketing
and the dashboard but "check" everywhere in the app.

## What Changes

- **Run history rows stack below `sm`**: badge and sentence on top, timestamp · trigger on one
  mono line beneath; the sentence keeps its measure at every width. Same markup on the public
  status page.
- **The detail header stacks below `sm`**: eyebrow and name first, actions on their own row.
  The "Run history" label and its filters wrap instead of sharing one line.
- **The dashboard row becomes one link.** `Timeline` gains a `static` mode that renders
  non-interactive squares; the row is a `<Link>`, so nothing interactive nests inside it. The
  rename control on detail stops wrapping the `<h1>` in a `<button>`.
- **One `ExpectationsFields` component** renders growth mode, minimum new records, required
  fields and non-empty fields on both the create form and the Expectations editor, with the
  create form's labels, hints and one-word options, every label wired by `for`/`id`.
- **Card-header actions share one size**: Copy, Edit and Enable are ghost-xs; Disable and
  Remove are danger-xs. The page-header Delete and the Add-channel form button are unchanged.
- **Sentences in Manrope.** "Loading…" and the no-runs sentences leave the mono face; a Check
  with no runs shows one empty-state sentence (the state card's), not two.
- **Card titles are `<h2>`** on Check detail and New Check.
- **"Check" is spelled as PRODUCT.md records it** in every heading, button and toast.

## Capabilities

### Modified Capabilities
- `checks`: "Detail view is connector-aware" — the header label reads "{connector} Check".
- `design-system`: "Every form control has a visible, associated label" gains the shared
  component clause; new requirements for stacking below `sm`, no nested interactive content,
  card-header action sizes, sentence typeface, and the product noun.

## Impact

`frontend/src/pages/{CheckDetail,Dashboard,NewCheck,PublicStatus}.jsx`,
`frontend/src/components/Timeline.jsx`, a new `frontend/src/components/ExpectationsFields.jsx`,
`frontend/src/App.js` (one "Loading…" line), `DESIGN.md` (the xs button variants and two Do's).
No API change; every existing `data-testid` is kept. Sequential with `public-page-shell` on
`PublicStatus.jsx` only (this change first).
