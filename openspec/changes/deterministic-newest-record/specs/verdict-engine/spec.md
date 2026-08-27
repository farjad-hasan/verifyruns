## MODIFIED Requirements

### Requirement: Fingerprint a record set
The system SHALL compute `record_count`, the sorted union of field names, `null_pct` per field (percentage of records where the value is None, blank string, or empty list/dict), and `newest_record` = the first element of the sample after connector-defined ordering (Airtable: `createdTime` desc; Postgres: the query's own ORDER BY; HTTP/JSON: max of `config.newest_key` when set, else the last element). The fingerprint SHALL also store `newest_window`, the first 5 ordered records, and `newest_defined: true|false`.

#### Scenario: Airtable ordering
- **WHEN** the sample contains records created at 09:00, 11:00 and 10:00
- **THEN** `newest_record` is the 11:00 record

#### Scenario: Postgres without ORDER BY
- **WHEN** the guarded query has no ORDER BY clause
- **THEN** `newest_defined` is false and the non-empty rule is skipped with a note

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
