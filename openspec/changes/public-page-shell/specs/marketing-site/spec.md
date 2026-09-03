## MODIFIED Requirements

### Requirement: Explanatory pages are linked from every public page
The site SHALL serve `/pricing`, `/data` and `/security` as public routes. One shared footer, rendered on every route (public and app), SHALL link to Pricing, What we store, Security, Privacy and Terms in that order; no page SHALL carry its own hand-written link list in place of it. `/data` SHALL state the same facts as `docs/what-we-store.md` and `/security` the same posture, known gaps and disclosure contact as `docs/security.md`, and each SHALL show a "Last updated" line carrying the date of the document it restates.

#### Scenario: Security page
- **WHEN** a visitor opens `/security`
- **THEN** they see the posture sections (passwords and sessions, secrets at rest, egress, read-only Postgres, data kept, rate limits), a "Known gaps" list, and the disclosure email

#### Scenario: Deep link
- **WHEN** a visitor opens `/security` or `/data` directly on the Pages host
- **THEN** the SPA serves the page (HTTP 200), not a redirect to `/`

#### Scenario: Pricing reaches the Terms
- **WHEN** a visitor scrolls to the end of `/pricing`
- **THEN** the footer offers Pricing, What we store, Security, Privacy and Terms, in the same order as on `/`
