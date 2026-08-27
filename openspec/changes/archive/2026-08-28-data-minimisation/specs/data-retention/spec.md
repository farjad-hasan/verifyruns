## ADDED Requirements

### Requirement: Runs store fingerprints, not rows, by default
The system SHALL store per run only `record_count`, `sample_size`, field names, `null_pct`, and a SHA-256 of the canonicalised newest record; raw `newest_record` and upstream response bodies SHALL be stored only when the Check has `store_samples: true`, and then expire after 30 days.

#### Scenario: Default Check
- **WHEN** a run completes on a Check without `store_samples`
- **THEN** the stored run has `newest_hash` and no `newest_record` or response body

#### Scenario: Opt-in expires
- **WHEN** `store_samples` is true and a run is 31 days old
- **THEN** its sample fields have been removed by the TTL index
