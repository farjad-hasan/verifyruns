## MODIFIED Requirements

### Requirement: Fingerprint a record set
The system SHALL compute `record_count`, the sorted union of field names, `null_pct` per field (percentage of records where the value is None, blank string, or empty list/dict), and `newest_record` = the first element of the sample after connector-defined ordering (Airtable: `createdTime` desc; Postgres: the query's own ORDER BY; HTTP/JSON: max of `config.newest_key` when set, else the last element). The fingerprint SHALL also store `newest_window`, the first 5 ordered records, and `newest_defined: true|false`.

#### Scenario: Mixed field set
- **WHEN** records (newest-first) are `[{a:1,b:""},{a:2}]`
- **THEN** fields are `[a,b]`, `null_pct` is `{a:0.0, b:100.0}`, `newest_record` is `{a:1,b:""}`

#### Scenario: Airtable ordering
- **WHEN** the sample contains records created at 09:00, 11:00 and 10:00
- **THEN** `newest_record` is the 11:00 record

#### Scenario: Postgres without ORDER BY
- **WHEN** the guarded query has no ORDER BY clause
- **THEN** `newest_defined` is false and any configured non-empty rule FAILs as incomplete

### Requirement: Baseline is the last 30 PASS runs
The system SHALL load up to 30 PASS runs from the current destination configuration for field-history comparison. Both histories SHALL be bound to an opaque hash of destination settings; unbound historical observations and changed settings SHALL start a fresh baseline. Counts SHALL instead compare with the preceding readable destination observation, including FAILs. Fetch errors and heartbeats SHALL NOT establish a count baseline. A retry SHALL reuse the original failed run baseline. Superseded retries SHALL NOT recover an incident or become a new count observation. A pure first-baseline incomplete verdict SHALL NOT send an incident alert.

#### Scenario: No prior observation
- **WHEN** a positive-growth or steady Check has no readable baseline
- **THEN** it records the current observation and FAILs with an explanation that growth cannot yet be verified

#### Scenario: Earlier failure added records
- **WHEN** a FAIL observed 102 records after a PASS of 100, and the next run observes 102 with a claim of 2
- **THEN** it FAILs because the destination gained zero since the preceding observation

### Requirement: Record-growth rule
The system SHALL compute `delta = record_count − preceding readable record_count`. In `growth` mode it SHALL FAIL when `delta < expected`, where `expected` is `claimed_new` when the run carries one, else `min_new_records`. In `steady` mode it SHALL FAIL when `delta ≠ 0`. In `claimed` mode a missing `claimed_new` is itself a FAIL. A first run SHALL NOT use pre-existing rows as evidence of growth: positive-growth and steady assertions FAIL as incomplete until a baseline exists. A claim SHALL be read only from the body keys `wrote` and `expected_new`; a bare `count` key SHALL be ignored with a body note. A malformed, negative or unsafe-integer claim SHALL be noted and the run SHALL FAIL as incomplete. When either side of the comparison carries an inexact count (`count_capped` or `count_estimated`, this run or the preceding observation), any configured count assertion SHALL FAIL as incomplete and the run message SHALL say why it could not be evaluated; field rules still apply.

#### Scenario: Silent no-op run
- **WHEN** the preceding readable observation had 40 records, this run has 40, and `min_new_records` is 1
- **THEN** the verdict is FAIL with "the destination gained 0 records (expected at least 1)"

#### Scenario: Count plateau from a connector cap
- **WHEN** the connector hit its count ceiling or its count timed out
- **THEN** the configured growth assertion FAILs as incomplete, and field rules still run

#### Scenario: Large table keeps growing
- **WHEN** the preceding readable observation had 2,400 records and this run has 2,403
- **THEN** the verdict is PASS with "Destination gained 3 record(s) since the previous observation. Configured checks passed."

#### Scenario: Claimed mismatch
- **WHEN** the body said `wrote: 3` and the destination gained 0
- **THEN** the verdict is FAIL with "your workflow said it wrote 3 records; the destination gained 0"

#### Scenario: Claimed match
- **WHEN** the body said `wrote: 3` and the destination gained 3
- **THEN** the verdict is PASS with "Destination gained 3 record(s) since the previous observation; your workflow reported at least 3. Configured checks passed."

#### Scenario: Growth optional
- **WHEN** `min_new_records` is 0, no claim, and the count is unchanged
- **THEN** the growth rule adds no reason

#### Scenario: Steady table changed
- **WHEN** `growth_mode` is `steady` and the count moved from 12 to 11
- **THEN** the verdict is FAIL with "the destination changed by -1 records (expected no change)"

#### Scenario: Steady table unchanged
- **WHEN** `growth_mode` is `steady` and the count is still 12
- **THEN** the verdict is PASS with "Destination unchanged at 12 records since the previous observation. Configured checks passed."

#### Scenario: Passthrough payload with a count key
- **WHEN** the webhook body is `{"count": 0}` from a forwarded node payload and `min_new_records` is 1 with no growth
- **THEN** no claim is read, the verdict is FAIL on the growth rule, and the run notes the ignored key

#### Scenario: Deliberate zero claim
- **WHEN** the body is `{"wrote": 0}` and a baseline exists and the destination gained 0
- **THEN** the verdict is PASS for the minimum claim

#### Scenario: Negative claim
- **WHEN** the body is `{"wrote": -2}`
- **THEN** the run FAILs as incomplete and notes the invalid value

#### Scenario: Postgres count timed out
- **WHEN** the preceding readable observation counted 5,000,000 and this run's COUNT timed out (`count_estimated`)
- **THEN** the configured growth assertion FAILs as incomplete rather than judging an estimated delta

### Requirement: Field rules
The system SHALL FAIL when any `required_fields` entry is absent from the field set, when a field present in every baseline PASS run is absent now ("disappeared"), or when a `non_empty_fields` entry is absent, or is empty in `newest_record` and in the majority of `newest_window`. When `newest_defined` is false the configured non-empty rule SHALL FAIL as incomplete and the run message SHALL say how to enable it.

#### Scenario: Required field missing
- **WHEN** `required_fields` contains `price` and no record has `price`
- **THEN** the diff message includes "the field `price` is missing"

#### Scenario: One outlier does not fail
- **WHEN** `email` is empty in the newest record but present in 4 of the 5 newest
- **THEN** the non-empty rule adds no reason

#### Scenario: Newest and majority empty
- **WHEN** `email` is empty in the newest record and in 3 of the 5 newest
- **THEN** the diff message includes "the field `email` is empty in 3 of the 5 newest records"

#### Scenario: Cannot inspect newest records
- **WHEN** `non_empty_fields` is set and `newest_defined` is false
- **THEN** the verdict is FAIL and the message asks for ORDER BY <timestamp column> DESC

#### Scenario: Field disappeared
- **WHEN** `sku` was present in all 30 baseline runs and is absent now
- **THEN** the diff message includes "the field `sku` disappeared — it was present in the last 30 good runs"

### Requirement: Diff message reads like a person wrote it
Reasons SHALL be joined with commas and "and", prefixed "Run reported success, but " and terminated with a period; PASS wording SHALL name the observation interval and say "Configured checks passed." rather than imply exact record reconciliation. Incomplete assertions SHALL explain what could not be verified.

#### Scenario: Two reasons
- **WHEN** growth is 0 and `price` is missing
- **THEN** the message is "Run reported success, but the destination gained 0 records (expected at least 1) and the field `price` is missing."
