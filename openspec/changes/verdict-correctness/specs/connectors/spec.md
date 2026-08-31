## MODIFIED Requirements

### Requirement: Airtable connector reads at most 100 records
The system SHALL GET `https://api.airtable.com/v0/{base_id}/{table}` with `pageSize=100` (plus `&view=` when set) and the PAT as bearer, follow the `offset` cursor until the response has none or `VR_AIRTABLE_MAX_PAGES` (default 40, i.e. 4,000 records — sized to the Workers free plan's 50 subrequests per request) is reached, and report the true number of records fetched as the count. Page one SHALL be fetched with all fields and is the sample; later pages SHALL request a single field (`fields[]` = the first field seen on page one) so counting stays cheap. The newest record SHALL be chosen by `createdTime` across all pages and, when it is not on page one, fetched individually so it heads the sample. When the ceiling is hit the run SHALL be marked `count_capped` and the message SHALL say so, and the fingerprint SHALL carry `count_capped` so the verdict engine treats the count as inexact rather than failing on a saturated delta.

#### Scenario: Table larger than 100 rows
- **WHEN** the table holds 250 records
- **THEN** three pages are fetched, pages two and three carry `fields[]`, and the fingerprint reports `record_count: 250` with `sample_size` ≤ 101

#### Scenario: Newest record is on a later page
- **WHEN** the most recently created record is on page three
- **THEN** it is fetched by id and is `newest_record`

#### Scenario: Ceiling reached
- **WHEN** the table holds more than `VR_AIRTABLE_MAX_PAGES × 100` records
- **THEN** `record_count` equals the ceiling, the diff message notes "count capped at <ceiling>", and the growth rule is skipped per the verdict-engine spec

#### Scenario: Missing records array
- **WHEN** the response lacks a `records` list
- **THEN** the run FAILs with "Airtable response is missing the `records` array."
