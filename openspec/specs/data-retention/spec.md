# data-retention Specification

## Purpose
What a run is allowed to keep about the destination: counts, field names, empty-rates and a hash of the newest record by default; raw rows and error bodies only when a Check opts in, and then for about 30 days. Also covers account deletion.

## Requirements

### Requirement: Runs store fingerprints, not rows, by default
The system SHALL store per run only `record_count`, `sample_size`, field names, `null_pct`, and a SHA-256 of the canonicalised newest record; raw `newest_record` and upstream response bodies SHALL be stored only when the Check has `store_samples: true`, and then expire after 30 days, removed by the cron tick's expiry sweep.

#### Scenario: Default Check
- **WHEN** a run completes on a Check without `store_samples`
- **THEN** the stored run has `newest_hash` and no `newest_record` or response body

#### Scenario: Opt-in expires
- **WHEN** `store_samples` is true and a run is 31 days old
- **THEN** its sample row has been deleted by the tick's expiry sweep
