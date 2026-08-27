## ADDED Requirements

### Requirement: Detail view is connector-aware
The Check detail page SHALL label the Check with its connector kind and SHALL render a Destination card specific to that connector: HTTP/JSON (URL, JSON path, masked bearer), Airtable (base, table, view, masked PAT), Postgres (query, masked DSN).

#### Scenario: Postgres Check
- **WHEN** the owner opens a Check whose `connector_kind` is `postgres`
- **THEN** the header reads "Postgres check" and the Destination card shows the query and the DSN masked to its last 4 characters
