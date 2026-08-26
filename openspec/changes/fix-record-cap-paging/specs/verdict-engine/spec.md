## MODIFIED Requirements

### Requirement: Record-growth rule
The system SHALL compute `delta = record_count − last PASS record_count` and FAIL when `delta < min_new_records`. On the first run it FAILs when `record_count < min_new_records`. `record_count` is the connector's true count, independent of the sample used for field metrics. Growth is measured only by total count, so deletions and rolling windows still produce false FAILs (see change `claimed-count-reconciliation`).

#### Scenario: Silent no-op run
- **WHEN** the last PASS had 40 records, this run has 40, and `min_new_records` is 1
- **THEN** the verdict is FAIL with "the destination gained 0 records (expected at least 1)"

#### Scenario: Large table keeps growing
- **WHEN** the last PASS had 2,400 records and this run has 2,403
- **THEN** the verdict is PASS with "Destination gained 3 record(s). All expectations met."

## ADDED Requirements

### Requirement: Fingerprint records the sample size
The fingerprint SHALL include `sample_size` (number of records inspected for fields, null rates and newest record) alongside `record_count`; the run panel SHALL display "N records (M sampled)" when they differ.

#### Scenario: Sampled run
- **WHEN** `record_count` is 5,000 and `sample_size` is 100
- **THEN** the run panel shows "5,000 records (100 sampled)"
