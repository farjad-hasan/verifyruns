# marketing-site Specification

## Purpose
The public pages that sell and explain VerifyRuns without a login: the landing page (`/`), `/pricing`, `/data` (what we store) and `/security`. They exist so a visitor can see the FAIL sentence, understand who the product is for, set it up in their tool, and check what it keeps and how it is protected — all before signing up.

## Requirements

### Requirement: The diff message is the hero
The landing page SHALL show a rendered FAIL card with a real diff message next to the run timeline above the fold, a "who this is for" statement, and per-platform setup snippets for n8n, Make and Zapier.

#### Scenario: First visit
- **WHEN** a logged-out visitor opens `/`
- **THEN** they see a FAIL card reading "Run reported success, but the destination gained 0 records…" without scrolling

### Requirement: Explanatory pages are linked from every public page
The site SHALL serve `/pricing`, `/data` and `/security` as public routes, and the landing footer SHALL link to all three; `/data` SHALL state the same facts as `docs/what-we-store.md` and `/security` the same posture, known gaps and disclosure contact as `docs/security.md`.

#### Scenario: Security page
- **WHEN** a visitor opens `/security`
- **THEN** they see the posture sections (passwords and sessions, secrets at rest, egress, read-only Postgres, data kept, rate limits), a "Known gaps" list, and the disclosure email

#### Scenario: Deep link
- **WHEN** a visitor opens `/security` or `/data` directly on the Pages host
- **THEN** the SPA serves the page (HTTP 200), not a redirect to `/`

### Requirement: Verdict sentences are never truncated
Public status pages and Check detail pages SHALL wrap the diff message in full; the sentence is the product and MUST NOT be cut with an ellipsis.

#### Scenario: Long FAIL sentence on a status page
- **WHEN** a run's diff message is longer than the row
- **THEN** it wraps onto further lines and the whole sentence is readable

### Requirement: A recorded forced FAIL exists
The repository SHALL carry `docs/media/forced-fail.gif`, a recording of a live public status page going from PASS to FAIL after a webhook claiming records the destination did not gain, and the README SHALL embed it.

#### Scenario: README
- **WHEN** someone opens the README
- **THEN** the GIF appears before the first section heading

### Requirement: Terms and privacy policy are published
The site SHALL serve `/terms` and `/privacy` as public routes whose text matches `docs/terms.md` and `docs/privacy.md`; the landing footer, the sign-up form and `/data` SHALL link to them. The privacy policy SHALL name the operator, every category of data stored and why, the sub-processors that touch it, retention and deletion, and a contact address; the terms SHALL state early-access status, no warranty, acceptable use (destinations you are authorised to read), termination and how changes are announced.

#### Scenario: Sign-up
- **WHEN** a visitor opens `/signup`
- **THEN** the form states that creating an account accepts the Terms and Privacy Policy, with both linked

#### Scenario: Deep link
- **WHEN** a visitor opens `/privacy` directly on the Pages host
- **THEN** the SPA serves the page (HTTP 200)
