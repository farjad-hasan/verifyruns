## MODIFIED Requirements

### Requirement: Destinations must be public addresses
The system SHALL refuse, at save time and at fetch time, any destination whose host is a literal loopback, private (RFC 1918 / ULA), link-local, unspecified or cloud-metadata address, or `localhost`, unless `VR_ALLOW_PRIVATE_EGRESS=1`; redirects SHALL NOT be followed. DNS names are not resolved on Workers; the platform's network cannot reach private ranges, which is the guarantee for named hosts.

#### Scenario: Metadata address
- **WHEN** a user saves an HTTP/JSON Check whose URL is `http://169.254.169.254/latest`
- **THEN** `POST /api/checks` returns HTTP 400 "Destination must be a public address"

### Requirement: Fetch and request budgets
The system SHALL cap destination responses at 5 MB and each destination request at 20 s, and SHALL rate-limit `/api/auth/*` per IP, `/api/hook/*` per secret, and Check creation per user (best effort per isolate on Workers).

#### Scenario: Webhook flood
- **WHEN** one secret receives more than the limit in a minute on one isolate
- **THEN** excess requests return HTTP 429 and no runs are queued for them
