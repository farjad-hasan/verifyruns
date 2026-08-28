## MODIFIED Requirements

### Requirement: Postgres connector runs a guarded read-only query capped at 100 rows
The system SHALL accept a single `SELECT`/`WITH` statement with no semicolons and none of the banned keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, CREATE, COMMENT), connect with the encrypted DSN over the platform's TCP sockets in a single attempt (`VR_PG_CONNECT_TIMEOUT_MS`, default 15 s, no reconnects), set `default_transaction_read_only = on` and `statement_timeout = 15000`, execute `SELECT COUNT(*) FROM (<query>) AS _vr` for the count and `SELECT * FROM (<query>) AS _vr LIMIT 100` for the sample. `record_count` SHALL be the COUNT result; `sample_size` the sample length. Non-JSON values are coerced to strings. TLS SHALL be used unless the DSN contains `sslmode=disable`; the system SHALL NOT fall back to cleartext on its own. If the connection cannot be established the run SHALL FAIL within one attempt with a message naming the cause rather than hang, and a TLS failure SHALL say that on the hosted build the server certificate must be publicly trusted and name the alternatives.

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
- **THEN** the run FAILs with "Postgres connection error: <reason>." after a single attempt

#### Scenario: Server certificate not publicly trusted
- **WHEN** the server accepts SSLRequest but the TLS handshake fails (for example a Supabase pooler, whose certificate is signed by a private CA)
- **THEN** the run FAILs within one attempt with "Postgres connection error: TLS handshake failed." and details explaining that on the hosted build the certificate must be publicly trusted, that `sslmode=disable` connects unencrypted, and that self-hosting is the other option

#### Scenario: Server does not offer TLS
- **WHEN** the server answers `N` to SSLRequest and the DSN does not say `sslmode=disable`
- **THEN** the run FAILs with "Postgres connection error: the server does not support TLS." and details naming `sslmode=disable` as the explicit, cleartext opt-in
