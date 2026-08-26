# verdict-engine

## Purpose
Deterministic code (no AI) that fingerprints a record set and compares it with the trailing window of PASS runs to produce PASS/FAIL and a human-readable diff. As built in `_fingerprint` and `_compute_verdict`.

## Requirements

### Requirement: Fingerprint a record set
The system SHALL compute `record_count`, the sorted union of field names, `null_pct` per field (percentage of records where the value is None, blank string, or empty list/dict), and `newest_record` = the LAST element of the fetched list. Order is whatever the connector returned (Airtable view order; Postgres result order without ORDER BY), so "newest" is not guaranteed (known defect; see change `deterministic-newest-record`).

#### Scenario: Mixed field set
- **WHEN** records are `[{a:1,b:""},{a:2}]`
- **THEN** fields are `[a,b]`, `null_pct` is `{a:0.0, b:100.0}`, `newest_record` is `{a:2}`

### Requirement: Baseline is the last 30 PASS runs
The system SHALL load up to 30 most recent runs with `verdict == "PASS"` (oldest → newest) as the comparison window; FAIL runs never enter the baseline.

#### Scenario: No prior PASS
- **WHEN** the Check has never passed
- **THEN** the run is compared only against expectations, and a PASS message reads "First successful check. Destination has N records across M fields."

### Requirement: Record-growth rule
The system SHALL compute `delta = record_count − last PASS record_count` and FAIL when `delta < min_new_records`. On the first run it FAILs when `record_count < min_new_records`. Growth is measured only by total count, so deletions, rolling windows, and the connector caps above produce false FAILs.

#### Scenario: Silent no-op run
- **WHEN** the last PASS had 40 records, this run has 40, and `min_new_records` is 1
- **THEN** the verdict is FAIL with "the destination gained 0 records (expected at least 1)"

#### Scenario: Count plateau from a connector cap
- **WHEN** the connector caps reads at 100 and the table has grown past 100
- **THEN** every subsequent run has delta 0 and FAILs while `min_new_records ≥ 1`

### Requirement: Field rules
The system SHALL FAIL when any `required_fields` entry is absent from the field set, when a field present in every baseline PASS run is absent now ("disappeared"), or when a `non_empty_fields` entry is present but empty in `newest_record`.

#### Scenario: Required field missing
- **WHEN** `required_fields` contains `price` and no record has `price`
- **THEN** the diff message includes "the field `price` is missing"

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
