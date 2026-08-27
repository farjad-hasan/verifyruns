## MODIFIED Requirements

### Requirement: Destinations are fetched from the server with no egress restrictions
The system SHALL perform all destination reads server-side and SHALL refuse, both when a Check is saved and again before every fetch, any destination whose host resolves to a loopback, private, link-local, multicast, reserved, unspecified or cloud-metadata address, unless `VR_ALLOW_PRIVATE_EGRESS=1`. Redirects SHALL NOT be followed. HTTP/JSON responses SHALL be read in a stream and abandoned past `VR_MAX_RESPONSE_BYTES` (default 5 MB).

#### Scenario: Internal address supplied
- **WHEN** a user saves an HTTP/JSON Check whose URL resolves to 10.0.0.5 and private egress is not allowed
- **THEN** `POST /api/checks` returns HTTP 400 "Destination must be a public address (10.0.0.5 is private). Set VR_ALLOW_PRIVATE_EGRESS=1 on a self-hosted instance to allow it."

#### Scenario: DNS changes after save
- **WHEN** a saved destination later resolves to a private address at fetch time
- **THEN** the run FAILs with the same message and nothing is fetched

#### Scenario: Oversized response
- **WHEN** the destination returns more than `VR_MAX_RESPONSE_BYTES`
- **THEN** the run FAILs with "Destination response exceeded 5 MB." and the read is abandoned at the cap

#### Scenario: Self-hosted internal database
- **WHEN** `VR_ALLOW_PRIVATE_EGRESS=1` and a Check points at 10.0.0.5
- **THEN** the Check saves and fetches normally
