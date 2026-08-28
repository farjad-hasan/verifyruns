## ADDED Requirements

### Requirement: Terms and privacy policy are published
The site SHALL serve `/terms` and `/privacy` as public routes whose text matches `docs/terms.md` and `docs/privacy.md`; the landing footer, the sign-up form and `/data` SHALL link to them. The privacy policy SHALL name the operator, every category of data stored and why, the sub-processors that touch it, retention and deletion, and a contact address; the terms SHALL state early-access status, no warranty, acceptable use (destinations you are authorised to read), termination and how changes are announced.

#### Scenario: Sign-up
- **WHEN** a visitor opens `/signup`
- **THEN** the form states that creating an account accepts the Terms and Privacy Policy, with both linked

#### Scenario: Deep link
- **WHEN** a visitor opens `/privacy` directly on the Pages host
- **THEN** the SPA serves the page (HTTP 200)
