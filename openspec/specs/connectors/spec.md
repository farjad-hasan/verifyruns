# connectors

## Purpose
How VerifyRuns reads records from a destination. Three paste-a-token connectors, all fetched server-side, none via OAuth. As built in `_fetch_records` and `_prepare_config_for_storage`.

## Requirements

### Requirement: HTTP/JSON connector
The system SHALL GET `config.url` with an optional `Authorization: Bearer` header (20 s timeout), parse JSON, and resolve `config.json_path` (dotted keys) to an array; only dict elements are kept as records. When `config.newest_key` is set, records SHALL be ordered by that field descending for the sample. There is no cap on records beyond what the endpoint returns.

#### Scenario: Root array
- **WHEN** the response body is a JSON array and `json_path` is empty
- **THEN** every object element becomes a record

#### Scenario: newest_key ordering
- **WHEN** `newest_key` is `created_at`
- **THEN** the record with the greatest `created_at` is `newest_record`

#### Scenario: Path not found
- **WHEN** `json_path` does not resolve to an array
- **THEN** the run FAILs with "Could not find an array of records at path `<path>`"

#### Scenario: Upstream error
- **WHEN** the response status is ≥ 400
- **THEN** the run FAILs with "Destination fetch failed with HTTP <code>" and the first 500 chars of the body are stored in `error_details`

### Requirement: Airtable connector reads at most 100 records
The system SHALL GET `https://api.airtable.com/v0/{base_id}/{table}` with `pageSize=100` (plus `&view=` when set) and the PAT as bearer, follow the `offset` cursor until the response has none or `VR_AIRTABLE_MAX_RECORDS` (default 10,000) is reached, flatten each record to `{id, createdTime, ...fields}`, and report the true number of records fetched as the count. When the ceiling is hit the run message SHALL say so.

#### Scenario: Table larger than 100 rows
- **WHEN** the table holds 250 records
- **THEN** three pages are fetched and the fingerprint reports `record_count: 250`

#### Scenario: Ceiling reached
- **WHEN** the table holds more than `VR_AIRTABLE_MAX_RECORDS` records
- **THEN** `record_count` equals the ceiling and the diff message notes "count capped at <ceiling>"

#### Scenario: Missing records array
- **WHEN** the response lacks a `records` list
- **THEN** the run FAILs with "Airtable response is missing the `records` array."

### Requirement: Postgres connector runs a guarded read-only query capped at 100 rows
The system SHALL accept a single `SELECT`/`WITH` statement with no semicolons and none of the banned keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, CREATE, COMMENT), connect with the encrypted DSN (15 s timeout), set `default_transaction_read_only = on` and `statement_timeout = 15000`, execute `SELECT COUNT(*) FROM (<query>) AS _vr` for the count and `SELECT * FROM (<query>) AS _vr LIMIT 100` for the sample. `record_count` SHALL be the COUNT result; `sample_size` the sample length. Non-JSON values are coerced to strings.

#### Scenario: Query returns 5,000 rows
- **WHEN** the query matches 5,000 rows
- **THEN** the fingerprint reports `record_count: 5000` and `sample_size: 100`

#### Scenario: Count times out
- **WHEN** the COUNT statement exceeds 15 s
- **THEN** `record_count` falls back to the sample length and the run stores `count_estimated: true`

#### Scenario: Write statement rejected at save time
- **WHEN** the query starts with anything other than SELECT/WITH or contains a banned keyword
- **THEN** `POST/PATCH /api/checks` returns HTTP 400 and nothing is stored

#### Scenario: Connection failure
- **WHEN** the DSN cannot connect
- **THEN** the run FAILs with "Postgres connection error: <ExceptionType>."

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
