## MODIFIED Requirements

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
