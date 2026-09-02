## MODIFIED Requirements

### Requirement: Manual run
`POST /api/checks/{id}/run` SHALL queue a run with `trigger="manual"` for the owner.

#### Scenario: Run now
- **WHEN** the owner clicks "Run Check now"
- **THEN** a run is queued and `{run_id, status: "queued"}` is returned

### Requirement: Detail view is connector-aware
The Check detail page SHALL label the Check with its connector kind and SHALL render a Destination card specific to that connector: HTTP/JSON (URL with every query-string value masked to its last four characters, JSON path, masked bearer), Airtable (base, table, view, masked PAT), Postgres (query, masked DSN). The label spells the entity "Check", as `PRODUCT.md` records.

#### Scenario: Postgres Check
- **WHEN** the owner opens a Check whose `connector_kind` is `postgres`
- **THEN** the header reads "Postgres Check" and the Destination card shows the query and the DSN masked to its last 4 characters

#### Scenario: HTTP/JSON Check with a key in the query string
- **WHEN** the owner opens a Check whose GET URL is `https://host/rest/v1/t?select=id&apikey=abcdefgh1234`
- **THEN** the Destination card shows `https://host/rest/v1/t?select=••••id&apikey=••••1234`, and the sanitised Check returned by `GET /api/checks/{id}` carries the URL already masked
