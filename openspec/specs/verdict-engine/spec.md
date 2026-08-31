# verdict-engine

## Purpose
Deterministic code (no AI) that fingerprints a record set and compares it with the trailing window of PASS runs to produce PASS/FAIL and a human-readable diff. As built in `_fingerprint` and `_compute_verdict`.
## Requirements
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
- **THEN** `newest_defined` is false and the non-empty rule is skipped with a note

### Requirement: Baseline is the last 30 PASS runs
The system SHALL load up to 30 most recent runs with `verdict == "PASS"` (oldest → newest) as the comparison window; FAIL runs never enter the baseline.

#### Scenario: No prior PASS
- **WHEN** the Check has never passed
- **THEN** the run is compared only against expectations, and a PASS message reads "First successful check. Destination has N records across M fields."

### Requirement: Record-growth rule
The system SHALL compute `delta = record_count − last PASS record_count`. In `growth` mode it SHALL FAIL when `delta < expected`, where `expected` is `claimed_new` when the run carries one, else `min_new_records`. In `steady` mode it SHALL FAIL when `delta ≠ 0`. In `claimed` mode a missing `claimed_new` is itself a FAIL. On the first run the comparison uses `record_count` in place of `delta`. A claim SHALL be read only from the body keys `wrote` and `expected_new`; a bare `count` key SHALL be ignored with a body note. A negative claim SHALL be treated as absent with a body note. When either side of the comparison carries an inexact count (`count_capped` or `count_estimated`, this run or the baseline PASS), the growth rule SHALL contribute no reason and the run message SHALL say record-count checks were skipped; field rules still apply.

#### Scenario: Silent no-op run
- **WHEN** the last PASS had 40 records, this run has 40, and `min_new_records` is 1
- **THEN** the verdict is FAIL with "the destination gained 0 records (expected at least 1)"

#### Scenario: Count plateau from a connector cap
- **WHEN** the table has grown past what a single connector page returns
- **THEN** the growth rule is skipped with a note instead of failing on a saturated delta, and field rules still run

#### Scenario: Large table keeps growing
- **WHEN** the last PASS had 2,400 records and this run has 2,403
- **THEN** the verdict is PASS with "Destination gained 3 record(s). All expectations met."

#### Scenario: Claimed mismatch
- **WHEN** the body said `wrote: 3` and the destination gained 0
- **THEN** the verdict is FAIL with "your workflow said it wrote 3 records; the destination gained 0"

#### Scenario: Claimed match
- **WHEN** the body said `wrote: 3` and the destination gained 3
- **THEN** the verdict is PASS with "Destination gained 3 record(s), matching what your workflow reported."

#### Scenario: Growth optional
- **WHEN** `min_new_records` is 0, no claim, and the count is unchanged
- **THEN** the growth rule adds no reason

#### Scenario: Steady table changed
- **WHEN** `growth_mode` is `steady` and the count moved from 12 to 11
- **THEN** the verdict is FAIL with "the destination changed by -1 records (expected no change)"

#### Scenario: Steady table unchanged
- **WHEN** `growth_mode` is `steady` and the count is still 12
- **THEN** the verdict is PASS with "Destination unchanged at 12 records. All expectations met."

#### Scenario: Passthrough payload with a count key
- **WHEN** the webhook body is `{"count": 0}` from a forwarded node payload and `min_new_records` is 1 with no growth
- **THEN** no claim is read, the verdict is FAIL on the growth rule, and the run notes the ignored key

#### Scenario: Deliberate zero claim
- **WHEN** the body is `{"wrote": 0}` and the destination gained 0
- **THEN** the verdict is PASS — the workflow's report and the destination agree

#### Scenario: Negative claim
- **WHEN** the body is `{"wrote": -2}`
- **THEN** the claim is treated as absent and the run notes the ignored value

#### Scenario: Postgres count timed out
- **WHEN** the baseline PASS counted 5,000,000 and this run's COUNT timed out (`count_estimated`)
- **THEN** the growth rule is skipped with a note; there is no FAIL from the collapsed count

### Requirement: Field rules
The system SHALL FAIL when any `required_fields` entry is absent from the field set, when a field present in every baseline PASS run is absent now ("disappeared"), or when a `non_empty_fields` entry is present but empty in `newest_record` and in the majority of `newest_window`. When `newest_defined` is false the non-empty rule SHALL be skipped and the run message SHALL say how to enable it.

#### Scenario: Required field missing
- **WHEN** `required_fields` contains `price` and no record has `price`
- **THEN** the diff message includes "the field `price` is missing"

#### Scenario: One outlier does not fail
- **WHEN** `email` is empty in the newest record but present in 4 of the 5 newest
- **THEN** the non-empty rule adds no reason

#### Scenario: Newest and majority empty
- **WHEN** `email` is empty in the newest record and in 3 of the 5 newest
- **THEN** the diff message includes "the field `email` is empty in 3 of the 5 newest records"

#### Scenario: Skipped with a note
- **WHEN** `non_empty_fields` is set and `newest_defined` is false
- **THEN** the run message ends with "Newest-record checks were skipped: add ORDER BY <timestamp column> DESC to the query to enable them."

#### Scenario: Field disappeared
- **WHEN** `sku` was present in all 30 baseline runs and is absent now
- **THEN** the diff message includes "the field `sku` disappeared — it was present in the last 30 good runs"

### Requirement: Diff message reads like a person wrote it
Reasons SHALL be joined with commas and "and", prefixed "Run reported success, but " and terminated with a period; a PASS after growth reads "Destination gained N record(s). All expectations met."

#### Scenario: Two reasons
- **WHEN** growth is 0 and `price` is missing
- **THEN** the message is "Run reported success, but the destination gained 0 records (expected at least 1) and the field `price` is missing."

### Requirement: Fetch errors are FAIL runs
Any connector error SHALL be recorded as a FAIL run with an empty fingerprint and the error text in `diff_message`; the process never raises out of `execute_check`.

#### Scenario: Timeout
- **WHEN** the destination does not answer within the connector timeout
- **THEN** a FAIL run is stored with "Destination fetch error: <ExceptionType>."

### Requirement: Fingerprint records the sample size
The fingerprint SHALL include `sample_size` (number of records inspected for fields, null rates and newest record) alongside `record_count`; the run panel SHALL display "N records (M sampled)" when they differ.

#### Scenario: Sampled run
- **WHEN** `record_count` is 5,000 and `sample_size` is 100
- **THEN** the run panel shows "5,000 records (100 sampled)"

### Requirement: Stored fingerprints carry a hash, not the row
The fingerprint written to a run SHALL include `newest_hash` — SHA-256 of the canonical JSON of the newest record (keys sorted, compact separators) — and `sample_stored`. `newest_record` and `newest_window` SHALL NOT be written to the run document; the in-memory fingerprint used for the verdict is unchanged.

#### Scenario: Same row, different key order
- **WHEN** two runs see newest records `{"a": 1, "b": 2}` and `{"b": 2, "a": 1}`
- **THEN** both runs store the same `newest_hash`

#### Scenario: Verdict still uses the rows
- **WHEN** `non_empty_fields` is configured
- **THEN** the rule is evaluated on the in-memory newest window exactly as before, regardless of `store_samples`

