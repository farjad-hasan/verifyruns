## MODIFIED Requirements

### Requirement: Airtable connector reads at most 100 records
The system SHALL GET `https://api.airtable.com/v0/{base_id}/{table}` with `pageSize=100` (plus `&view=` when set) and the PAT as bearer, follow the `offset` cursor until the response has none or `VR_AIRTABLE_MAX_PAGES` (default 40, i.e. 4,000 records — sized to the Workers free plan's 50 subrequests per request) is reached, and report the true number of records fetched as the count. Page one SHALL be fetched with all fields and is the sample; later pages SHALL request a single field (`fields[]` = the first field seen on page one) so counting stays cheap. The newest record SHALL be chosen by `createdTime` across all pages and, when it is not on page one, fetched individually so it heads the sample. When the ceiling is hit the run SHALL be marked `count_capped` and the message SHALL say so.

#### Scenario: Table larger than 100 rows
- **WHEN** the table holds 250 records
- **THEN** three pages are fetched, pages two and three carry `fields[]`, and the fingerprint reports `record_count: 250` with `sample_size` ≤ 101

#### Scenario: Newest record is on a later page
- **WHEN** the most recently created record is on page three
- **THEN** it is fetched by id and is `newest_record`

#### Scenario: Ceiling reached
- **WHEN** the table holds more than `VR_AIRTABLE_MAX_PAGES × 100` records
- **THEN** `record_count` equals the ceiling and the diff message notes "count capped at <ceiling>"

#### Scenario: Missing records array
- **WHEN** the response lacks a `records` list
- **THEN** the run FAILs with "Airtable response is missing the `records` array."

### Requirement: Postgres connector runs a guarded read-only query capped at 100 rows
The system SHALL accept a single `SELECT`/`WITH` statement with no semicolons and none of the banned keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, CREATE, COMMENT), connect with the encrypted DSN over the platform's TCP sockets (15 s timeout), set `default_transaction_read_only = on` and `statement_timeout = 15000`, execute `SELECT COUNT(*) FROM (<query>) AS _vr` for the count and `SELECT * FROM (<query>) AS _vr LIMIT 100` for the sample. `record_count` SHALL be the COUNT result; `sample_size` the sample length. Non-JSON values are coerced to strings. If the platform cannot open the connection the run SHALL FAIL with a message naming the cause rather than hang.

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
- **THEN** the run FAILs with "Postgres connection error: <reason>."
