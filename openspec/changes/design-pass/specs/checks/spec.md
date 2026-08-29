## MODIFIED Requirements

### Requirement: Detail view is connector-aware
The Check detail page SHALL label the Check with its connector kind and SHALL render a Destination card specific to that connector: HTTP/JSON (URL with every query-string value masked to its last four characters, JSON path, masked bearer), Airtable (base, table, view, masked PAT), Postgres (query, masked DSN).

#### Scenario: Postgres Check
- **WHEN** the owner opens a Check whose `connector_kind` is `postgres`
- **THEN** the header reads "Postgres check" and the Destination card shows the query and the DSN masked to its last 4 characters

#### Scenario: HTTP/JSON Check with a key in the query string
- **WHEN** the owner opens a Check whose GET URL is `https://host/rest/v1/t?select=id&apikey=abcdefgh1234`
- **THEN** the Destination card shows `https://host/rest/v1/t?select=••••id&apikey=••••1234`, and the sanitised Check returned by `GET /api/checks/{id}` carries the URL already masked

### Requirement: List, read, update, delete own Checks only
The system SHALL scope every Check route to `user_id`; a Check owned by another user returns 404. The list route SHALL include the last 30 runs (oldest → newest) as `{id, verdict, timestamp, diff_message}` and `last_verdict` and SHALL omit `webhook_secret`; the detail route includes it.

#### Scenario: Cross-user access
- **WHEN** user B requests user A's Check by id
- **THEN** the response is HTTP 404 "Check not found"

#### Scenario: Update keeps stored secrets when omitted
- **WHEN** `PATCH /api/checks/{id}` sends `config` without the secret field
- **THEN** the previously encrypted secret is preserved

#### Scenario: Dashboard row carries the sentence
- **WHEN** a user lists their Checks
- **THEN** each Check's newest recent run includes its `diff_message`, so the dashboard can show the sentence without a second request
