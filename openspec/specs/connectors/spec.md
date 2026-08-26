# connectors

## Purpose
How VerifyRuns reads records from a destination. Three paste-a-token connectors, all fetched server-side, none via OAuth. As built in `_fetch_records` and `_prepare_config_for_storage`.

## Requirements

### Requirement: HTTP/JSON connector
The system SHALL GET `config.url` with an optional `Authorization: Bearer` header (20 s timeout), parse JSON, and resolve `config.json_path` (dotted keys) to an array; only dict elements are kept as records. There is no cap on records beyond what the endpoint returns.

#### Scenario: Root array
- **WHEN** the response body is a JSON array and `json_path` is empty
- **THEN** every object element becomes a record

#### Scenario: Path not found
- **WHEN** `json_path` does not resolve to an array
- **THEN** the run FAILs with "Could not find an array of records at path `<path>`"

#### Scenario: Upstream error
- **WHEN** the response status is ≥ 400
- **THEN** the run FAILs with "Destination fetch failed with HTTP <code>" and the first 500 chars of the body are stored in `error_details`

### Requirement: Airtable connector reads at most 100 records
The system SHALL GET `https://api.airtable.com/v0/{base_id}/{table}?maxRecords=100` (plus `&view=` when set) with the PAT as bearer, and flatten each record to `{id, createdTime, ...fields}`. It SHALL NOT follow the `offset` cursor, so `record_count` never exceeds 100 (known defect; see change `fix-record-cap-paging`).

#### Scenario: Table larger than 100 rows
- **WHEN** the table holds 250 records
- **THEN** the fingerprint reports `record_count: 100`

#### Scenario: Missing records array
- **WHEN** the response lacks a `records` list
- **THEN** the run FAILs with "Airtable response is missing the `records` array."

### Requirement: Postgres connector runs a guarded read-only query capped at 100 rows
The system SHALL accept a single `SELECT`/`WITH` statement with no semicolons and none of the banned keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, CREATE, COMMENT), connect with the encrypted DSN (15 s timeout), set `default_transaction_read_only = on`, and execute `SELECT * FROM (<query>) AS _vr LIMIT 100`. Non-JSON values are coerced to strings. `record_count` therefore never exceeds 100 (known defect; see change `fix-record-cap-paging`).

#### Scenario: Write statement rejected at save time
- **WHEN** the query starts with anything other than SELECT/WITH or contains a banned keyword
- **THEN** `POST/PATCH /api/checks` returns HTTP 400 and nothing is stored

#### Scenario: Connection failure
- **WHEN** the DSN cannot connect
- **THEN** the run FAILs with "Postgres connection error: <ExceptionType>."

### Requirement: Destinations are fetched from the server with no egress restrictions
The system SHALL perform all destination reads server-side. It does not block private, loopback, or link-local addresses, cap response size, or rate-limit fetches (known gap; see change `egress-lockdown`).

#### Scenario: Internal address supplied
- **WHEN** a user saves an HTTP/JSON Check whose URL resolves to a private network address
- **THEN** the server attempts the GET as for any other URL
