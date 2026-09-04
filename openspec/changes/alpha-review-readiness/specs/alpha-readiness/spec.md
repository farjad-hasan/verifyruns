## ADDED Requirements

### Requirement: Setup teaches useful coverage
The app SHALL default new Checks to a minimum growth of one, explain baseline establishment, offer email when configured as well as Slack/Discord, and identify missing alert configuration. A public /setup page SHALL describe supported connectors, scoped count semantics, field sampling, and a failure/recovery rehearsal.

#### Scenario: New operator
- **WHEN** an operator creates a Check
- **THEN** they can learn how to establish a baseline, send a real workflow run, test delivery and interpret the result without reading repository source

### Requirement: Alert channels can be tested independently
The owner SHALL be able to test one configured channel. The API SHALL report provider acceptance or failure without changing incident state, recording a verdict, exposing the target, or permitting another owner to send a test.

#### Scenario: Provider refuses test
- **WHEN** a channel provider returns a non-success response
- **THEN** the app displays a failed delivery message and the incident state remains unchanged

### Requirement: Review evidence is repeatable
The repository SHALL include an OPG review brief and a repeatable authenticated API smoke covering baseline, PASS, FAIL, recovery, public sharing and cleanup. Release evidence SHALL distinguish local simulations, deployed API tests, browser checks and actual provider receipt.

#### Scenario: Release report
- **WHEN** verification finishes
- **THEN** the report records passed checks and unresolved evidence without claiming untested capabilities are proven
