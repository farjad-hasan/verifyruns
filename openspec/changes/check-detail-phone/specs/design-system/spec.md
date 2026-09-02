## MODIFIED Requirements

### Requirement: Every form control has a visible, associated label
Text inputs, textareas and selects on New Check, the Expectations editor, the Alert channels form and the Run history filters SHALL each have a `<label>` associated by `for`/`id` (or wrapping), visible on screen; a placeholder SHALL NOT be the only label. The expectation fields (growth mode, minimum new records, required fields, non-empty fields) and the heartbeat field SHALL be rendered by one shared component on both New Check and the Expectations editor, so their labels, hints and option text cannot diverge between the two forms.

#### Scenario: Screen reader on the URL field
- **WHEN** the New Check destination URL input receives focus
- **THEN** its accessible name is a label such as "GET URL", not the placeholder

#### Scenario: Growth mode on both forms
- **WHEN** the growth-mode select is opened on New Check and then in the Expectations editor
- **THEN** both show the same option text and the same explanatory hint beneath the control

## ADDED Requirements

### Requirement: Verdict rows and page headers stack below 640 px
Run history rows (Check detail and the public status page) SHALL lay out as badge and sentence on top with timestamp and trigger on one line beneath when the viewport is narrower than the `sm` breakpoint (640 px), and the sentence SHALL span the full row width at every viewport. The Check detail header SHALL place its actions on their own row beneath the name below `sm`; the Run history label and its filters SHALL wrap rather than share one line.

#### Scenario: FAIL sentence on a phone
- **WHEN** a Check with a FAIL run is opened at a 390 px viewport
- **THEN** the sentence "Run reported success, but your workflow said it wrote 3 records; the destination gained 0." wraps at the card width, and its timestamp and trigger sit on one line beneath it

#### Scenario: Long Check name on a phone
- **WHEN** a Check named "brand-brief → Supabase brand_runs" is opened at a 390 px viewport
- **THEN** the name spans the full content width and Snooze, Run Check now and Delete appear on a row beneath it

### Requirement: Interactive content is never nested
No `<button>` or `<a>` SHALL contain another interactive element. A dashboard row SHALL be a single link; timeline squares rendered inside a link or button SHALL be non-interactive (`Timeline` `static` mode) and the static strip SHALL be hidden from assistive technology (`aria-hidden`), because the row's badge and sentence already carry the verdict and a labelled square would otherwise join the link's accessible name; a heading SHALL NOT be wrapped in a button.

#### Scenario: Dashboard row in the DOM
- **WHEN** the dashboard renders a Check with 30 runs
- **THEN** the row element contains no `<button>` descendants, is itself an `<a>` to the Check, and its accessible name is the Check name, connector, badge and sentence — not thirty square labels

### Requirement: Card-header actions share one size
An action placed in a card header (Copy, Edit, Enable, Disable, Remove) SHALL use the xs button size (`rp-btn-xs`): ghost for neutral actions, danger for destructive ones. Filled primary buttons are reserved for page headers, forms and empty states.

#### Scenario: Public status card
- **WHEN** a Check's public status is off
- **THEN** the Enable control is a ghost-xs button, the same size and weight as the Edit control on the Expectations card

### Requirement: Sentences are set in the body face
Any sentence the product speaks — loading text, empty states, hints, verdicts — SHALL be set in Manrope; JetBrains Mono is reserved for observed values (timestamps, counts, URLs, field names, connector kinds). A page SHALL show at most one empty-state sentence for a given condition.

#### Scenario: Check with no runs
- **WHEN** a Check with zero runs is opened
- **THEN** exactly one "No runs yet" sentence is shown, in Manrope

### Requirement: The product noun is "Check"
User-visible copy SHALL spell the entity "Check" (capitalised) in headings, buttons, toasts and confirmations, as `PRODUCT.md` records; lower-case "check" is reserved for the verb.

#### Scenario: Create form heading
- **WHEN** `/checks/new` renders
- **THEN** the H1 reads "Create a Check" and the submit button "Create Check"
