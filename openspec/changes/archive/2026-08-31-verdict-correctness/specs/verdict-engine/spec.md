## MODIFIED Requirements

### Requirement: Record-growth rule
The system SHALL compute `delta = record_count − last PASS record_count`. In `growth` mode it SHALL FAIL when `delta < expected`, where `expected` is `claimed_new` when the run carries one, else `min_new_records`. In `steady` mode it SHALL FAIL when `delta ≠ 0`. In `claimed` mode a missing `claimed_new` is itself a FAIL. On the first run the comparison uses `record_count` in place of `delta`. A claim SHALL be read only from the body keys `wrote` and `expected_new`; a bare `count` key SHALL be ignored with a body note. A negative claim SHALL be treated as absent with a body note. When either side of the comparison carries an inexact count (`count_capped` or `count_estimated`, this run or the baseline PASS), the growth rule SHALL contribute no reason and the run message SHALL say record-count checks were skipped; field rules still apply.

#### Scenario: Silent no-op run
- **WHEN** the last PASS had 40 records, this run has 40, and `min_new_records` is 1
- **THEN** the verdict is FAIL with "the destination gained 0 records (expected at least 1)"

#### Scenario: Count plateau from a connector cap
- **WHEN** the table has grown past what a single connector page returns
- **THEN** the growth rule is skipped with a note instead of failing on a saturated delta, and field rules still run

#### Scenario: Large table keeps growing
- **WHEN** the last PASS had 2,400 records and this run has 2,403
- **THEN** the verdict is PASS with "Destination gained 3 record(s). All expectations met."

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

#### Scenario: Steady table unchanged
- **WHEN** `growth_mode` is `steady` and the count is still 12
- **THEN** the verdict is PASS with "Destination unchanged at 12 records. All expectations met."

#### Scenario: Passthrough payload with a count key
- **WHEN** the webhook body is `{"count": 0}` from a forwarded node payload and `min_new_records` is 1 with no growth
- **THEN** no claim is read, the verdict is FAIL on the growth rule, and the run notes the ignored key

#### Scenario: Deliberate zero claim
- **WHEN** the body is `{"wrote": 0}` and the destination gained 0
- **THEN** the verdict is PASS — the workflow's report and the destination agree

#### Scenario: Negative claim
- **WHEN** the body is `{"wrote": -2}`
- **THEN** the claim is treated as absent and the run notes the ignored value

#### Scenario: Postgres count timed out
- **WHEN** the baseline PASS counted 5,000,000 and this run's COUNT timed out (`count_estimated`)
- **THEN** the growth rule is skipped with a note; there is no FAIL from the collapsed count
