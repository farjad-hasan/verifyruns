## ADDED Requirements

### Requirement: Repository explains verification when the destination is unreachable
`docs/unreachable-destination.md` SHALL explain the run-table pattern for jobs whose real destination the edge cannot read: the table shape, an RLS recipe, the Check settings, a language-agnostic wrapper line, and an explicit statement of what the Check proves (the job reached its end and said so) versus what it cannot (the real destination changed). The page SHALL NOT be linked from the landing page or navigation until the activation trigger in its proposal fires.

#### Scenario: Job behind a VPN
- **WHEN** a reader's job writes to a database only reachable inside their network
- **THEN** the page gives them a working Check in one sitting and tells them in one sentence what that Check does not prove

#### Scenario: Not yet a marketed capability
- **WHEN** a visitor reads the landing page or the docs navigation
- **THEN** no link to the pattern appears
