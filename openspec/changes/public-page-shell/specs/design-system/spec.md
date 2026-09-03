## ADDED Requirements

### Requirement: Inline links use one rule
Links inside prose (documentation pages, auth notes, hints) SHALL use one class (`rp-inline`: underline, 4 px offset, a lighter grey on hover); chrome links (nav, footer, back links) SHALL use `rp-link`. No inline link SHALL be styled by an ad-hoc utility string.

#### Scenario: Privacy policy link
- **WHEN** the "What we store" link in the privacy policy is rendered
- **THEN** it is underlined at rest and lightens on hover, identical to the "Security" link on `/data`

### Requirement: Documentation pages keep a measure and a heading hierarchy
`/data`, `/security`, `/privacy` and `/terms` SHALL cap running text at 65 ch, SHALL render section titles as `<h2>` under the page `<h1>`, and SHALL carry one mono "Last updated {date}" line under the lede. Page titles passed to the document title SHALL NOT end in a full stop.

#### Scenario: Privacy policy at 1720 px
- **WHEN** `/privacy` is opened on a wide viewport
- **THEN** no paragraph runs wider than 65 ch and the browser tab reads "Privacy policy — VerifyRuns"
