## MODIFIED Requirements

### Requirement: Record-growth rule
The system SHALL compute `delta = record_count − last PASS record_count`. In `growth` mode it SHALL FAIL when `delta < expected`, where `expected` is `claimed_new` when the run carries one, else `min_new_records`. In `steady` mode it SHALL FAIL when `delta ≠ 0`. In `claimed` mode a missing `claimed_new` is itself a FAIL. On the first run the comparison uses `record_count` in place of `delta`.

#### Scenario: Silent no-op run
- **WHEN** the last PASS had 40 records, this run has 40, and `min_new_records` is 1
- **THEN** the verdict is FAIL with "the destination gained 0 records (expected at least 1)"

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
