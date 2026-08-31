## ADDED Requirements

### Requirement: Creation defaults cannot manufacture a first-run FAIL
The New Check form SHALL default `min_new_records` to 0 ("growth optional") with helper copy explaining that 1 asserts every run adds a record; growth mode remains the default mode. A user who changes nothing SHALL get a PASS on an honest run that wrote nothing.

#### Scenario: Untouched defaults, zero-growth run
- **WHEN** a Check is created with untouched expectation defaults and its first webhook run finds an unchanged destination
- **THEN** the verdict is PASS

#### Scenario: User asserts growth
- **WHEN** the user sets `min_new_records` to 1
- **THEN** behaviour is exactly today's: an unchanged destination FAILs
