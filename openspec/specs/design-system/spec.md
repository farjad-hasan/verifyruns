# design-system Specification

## Purpose
The visual contract every VerifyRuns surface satisfies, as recorded in `DESIGN.md` and `PRODUCT.md` at the repository root: how a verdict is encoded, how quiet text stays readable, which typefaces load, and how forms and dialogs behave for keyboard and assistive-technology users.

## Requirements

### Requirement: DESIGN.md and PRODUCT.md are the design authority
The repository SHALL carry `DESIGN.md` (Stitch DESIGN.md format: YAML token frontmatter plus the canonical sections) and `PRODUCT.md` at its root, and no other file SHALL define the design system. Any agent or contributor changing visual tokens SHALL change `DESIGN.md` in the same change.

#### Scenario: Token drift
- **WHEN** a colour, font or radius is introduced in the frontend that does not exist in `DESIGN.md`
- **THEN** the change is incomplete until `DESIGN.md` records it or the value is replaced with an existing token

### Requirement: A verdict is never conveyed by hue alone
Everywhere PASS or FAIL is shown — timeline squares, verdict badges, the dashboard health strip, alert-channel status marks — the verdict SHALL be distinguishable without colour: by a glyph, a shape, or a text label in addition to the emerald/red fill.

#### Scenario: Greyscale screenshot of a timeline
- **WHEN** a 30-run timeline containing at least one FAIL is rendered in greyscale
- **THEN** the FAIL squares are visibly different from the PASS squares

#### Scenario: Screen reader on a timeline square
- **WHEN** a timeline square receives focus
- **THEN** its accessible name states the verdict and the run time (e.g. "FAIL · 29 Aug 2026, 03:06")

### Requirement: Secondary text meets WCAG AA
Any text a user is expected to read — captions, helper text, eyebrows, timestamps, placeholders excepted — SHALL have a contrast ratio of at least 4.5:1 against the surface it sits on (`#0A0A0A`, `#0C0C0E`, `#121214`, `#18181B`, `#000000`), or at least 3:1 when rendered at 24 px or 19 px bold and above.

#### Scenario: Caption on a card
- **WHEN** a 12 px uppercase caption is rendered on a `#121214` card
- **THEN** its colour measures ≥ 4.5:1 against `#121214`

### Requirement: Only the system typefaces load
Pages SHALL request only Outfit, Manrope and JetBrains Mono from the font provider; no page SHALL request Inter or any other family.

#### Scenario: Font requests on first load
- **WHEN** `/` is loaded with an empty cache
- **THEN** every `fonts.googleapis.com` request names only Outfit, Manrope or JetBrains Mono

### Requirement: Every form control has a visible, associated label
Text inputs, textareas and selects on New Check, the Expectations editor, the Alert channels form and the Run history filters SHALL each have a `<label>` associated by `for`/`id` (or wrapping), visible on screen; a placeholder SHALL NOT be the only label.

#### Scenario: Screen reader on the URL field
- **WHEN** the New Check destination URL input receives focus
- **THEN** its accessible name is a label such as "GET URL", not the placeholder

### Requirement: The run detail sheet behaves as a modal dialog
The run detail panel SHALL be exposed as a dialog (`role="dialog"`, labelled by the verdict sentence), SHALL trap focus while open, SHALL close on Escape, and on close SHALL return focus to the element that opened it.

#### Scenario: Keyboard user opens and closes a run
- **WHEN** a user tabs to a timeline square, presses Enter, then presses Escape
- **THEN** the sheet opens with focus inside it, closes on Escape, and focus is back on that square

### Requirement: Query-string values are masked wherever a destination URL is displayed
Any surface that displays a destination URL SHALL show each query parameter's value masked to its last four characters (`?apikey=••••••••077x`), with the path and parameter names intact.

#### Scenario: Supabase REST destination
- **WHEN** a Check's GET URL contains `apikey=sb_publishable_…9077x`
- **THEN** the Destination card shows `apikey=••••••••077x` and the full value is available only through the edit form
