## ADDED Requirements

### Requirement: Destinations must be public addresses
The system SHALL resolve every destination host at save time and at fetch time and SHALL refuse loopback, private (RFC 1918 / ULA), link-local, and cloud-metadata ranges unless `VR_ALLOW_PRIVATE_EGRESS=1`; redirects into such ranges SHALL be refused too.

#### Scenario: Metadata address
- **WHEN** a user saves an HTTP/JSON Check whose URL resolves to 169.254.169.254
- **THEN** `POST /api/checks` returns HTTP 400 "Destination must be a public address"

### Requirement: Fetch and request budgets
The system SHALL cap destination responses at 5 MB and total fetch time per run at 60 s, and SHALL rate-limit `/api/auth/*` per IP, `/api/hook/*` per secret, and Check creation per user.

#### Scenario: Webhook flood
- **WHEN** one secret receives more than 60 requests in a minute
- **THEN** excess requests return HTTP 429 and no runs are queued for them
