## ADDED Requirements

### Requirement: Repository documents its own dogfood fleet
`docs/dogfood.md` SHALL list every job on the maintainer's machine that reports to VerifyRuns (job label, cadence, heartbeat hours, Check name), describe the run-table pattern a job uses when its real destination is unreachable from the edge (append one row to a cloud-readable table, then POST `{"wrote": 1}`), and state the label policy: neutral labels, no client, product or colleague names, no real record counts from work jobs. Adding a job SHALL be a documented four-step procedure.

#### Scenario: New job on the machine
- **WHEN** a maintainer adds a scheduled job and wants it watched
- **THEN** `docs/dogfood.md` tells them the table, the helper invocation, the Check settings and the heartbeat to pick without reading code

#### Scenario: Public status page stays clean
- **WHEN** a dogfood Check's public status link is opened
- **THEN** the Check name reveals no client, product or colleague identifier
