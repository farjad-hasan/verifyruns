## MODIFIED Requirements

### Requirement: Fingerprint a record set
The system SHALL compute `record_count`, the sorted union of field names, `null_pct` per field (percentage of records where the value is None, blank string, or empty list/dict), and `newest_record` = the first element of the sample after connector-defined ordering (Airtable: `createdTime` desc; Postgres: validated top-level descending output-column ordering, explicitly applied to the outer sample query; HTTP/JSON: max of `config.newest_key` when set, else the last element). The fingerprint SHALL also store `newest_window`, the first 5 ordered records, and `newest_defined: true|false`.

#### Scenario: Mixed field set
- **WHEN** records (newest-first) are `[{a:1,b:""},{a:2}]`
- **THEN** fields are `[a,b]`, `null_pct` is `{a:0.0, b:100.0}`, `newest_record` is `{a:1,b:""}`

#### Scenario: Airtable ordering
- **WHEN** the sample contains records created at 09:00, 11:00 and 10:00
- **THEN** `newest_record` is the 11:00 record

#### Scenario: Postgres without ORDER BY
- **WHEN** the guarded query has no ORDER BY clause
- **THEN** `newest_defined` is false and any configured non-empty rule FAILs as incomplete

For Postgres, newest_defined SHALL be false unless the leading top-level ORDER BY item names an output column with explicit DESC. Comments, string literals, window/subquery ordering, implicit ASC, and ambiguous expressions SHALL not establish newest-first evidence.

#### Scenario: Misleading ORDER BY text
- **WHEN** ORDER BY occurs only in a comment, literal, window or subquery, or the leading sort is ascending
- **THEN** newest_defined is false and configured non-empty assertions fail as incomplete

#### Scenario: Explicit descending column
- **WHEN** the query orders by its output timestamp column DESC
- **THEN** the sample query explicitly preserves that descending order and can evaluate newest-record assertions
