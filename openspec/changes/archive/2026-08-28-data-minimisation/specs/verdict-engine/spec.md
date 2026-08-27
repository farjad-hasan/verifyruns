## ADDED Requirements

### Requirement: Stored fingerprints carry a hash, not the row
The fingerprint written to a run SHALL include `newest_hash` — SHA-256 of the canonical JSON of the newest record (keys sorted, compact separators) — and `sample_stored`. `newest_record` and `newest_window` SHALL NOT be written to the run document; the in-memory fingerprint used for the verdict is unchanged.

#### Scenario: Same row, different key order
- **WHEN** two runs see newest records `{"a": 1, "b": 2}` and `{"b": 2, "a": 1}`
- **THEN** both runs store the same `newest_hash`

#### Scenario: Verdict still uses the rows
- **WHEN** `non_empty_fields` is configured
- **THEN** the rule is evaluated on the in-memory newest window exactly as before, regardless of `store_samples`
