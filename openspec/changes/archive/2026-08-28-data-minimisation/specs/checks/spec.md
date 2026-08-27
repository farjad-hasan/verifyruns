## ADDED Requirements

### Requirement: Sample storage is opt-in per Check
A Check SHALL carry `store_samples` (boolean, default false), settable at creation and via PATCH. Only when true SHALL runs keep the newest record, the newest window and upstream error bodies, in a `run_samples` document that expires about 30 days after the run.

#### Scenario: Default Check
- **WHEN** a run completes on a Check with `store_samples: false`
- **THEN** `GET /api/runs/{id}` has no `sample`, the fingerprint has `newest_hash` and `sample_stored: false`, and `error_details` is null

#### Scenario: Opt-in Check
- **WHEN** a run completes on a Check with `store_samples: true`
- **THEN** `GET /api/runs/{id}` includes `sample.newest_record`, `sample.newest_window` and `sample.expires_at` roughly 30 days ahead

### Requirement: Account deletion
`DELETE /api/auth/me` SHALL delete the caller's samples, runs, Checks and user record; the token SHALL stop working immediately.

#### Scenario: Delete account
- **WHEN** an authenticated user calls `DELETE /api/auth/me`
- **THEN** subsequent requests with the same token return 401 and none of the user's Checks resolve
