# data-retention Specification

## Purpose
What a run is allowed to keep about the destination: counts, field names, empty-rates and a hash of the newest record by default; raw rows and error bodies only when a Check opts in, and then for about 30 days. Also covers account deletion.
## Requirements
### Requirement: Runs store fingerprints, not rows, by default
The system SHALL store per run only `record_count`, `sample_size`, field names, `null_pct`, and a SHA-256 of the canonicalised newest record; raw `newest_record` and upstream response bodies SHALL be stored only when the Check has `store_samples: true`, and then expire after 30 days, removed by the cron tick's expiry sweep.

#### Scenario: Default Check
- **WHEN** a run completes on a Check without `store_samples`
- **THEN** the stored run has `newest_hash` and no `newest_record` or response body

#### Scenario: Opt-in expires
- **WHEN** `store_samples` is true and a run is 31 days old
- **THEN** its sample row has been deleted by the tick's expiry sweep

### Requirement: Account deletion leaves nothing behind
`DELETE /api/auth/me` SHALL delete the user's run samples, runs, Checks, pricing-interest rows and password-reset tokens, and then the user row, chunking statements to stay under the database's batch and bind limits so accounts of any size delete completely; the user row SHALL be deleted last, so a partial failure leaves a retryable account rather than orphaned rows. Afterwards no table SHALL hold the user's id or email.

#### Scenario: User who registered interest deletes the account
- **WHEN** a user has posted to `/api/interest` and then calls `DELETE /api/auth/me`
- **THEN** the response is 200, the token stops working, and `interest` has no row with that user id or email

#### Scenario: Account with hundreds of Checks
- **WHEN** a user with 300 Checks calls `DELETE /api/auth/me`
- **THEN** every row is deleted across multiple batches and the response is 200

### Requirement: Run history is bounded
The tick SHALL delete `check_runs` rows that are older than `VR_RUN_RETENTION_DAYS` (default 90) and beyond both the newest `VR_RUN_RETENTION_MIN` (default 35) rows and the newest 30 PASS rows of their Check, in bounded batches over a rotating cursor. The explicit PASS floor exists because the newest rows can be FAILs (a heartbeat streak), which would otherwise push a quiet Check's baseline past the row floor into deletion; retention can never remove a run the engine or the 30-square timeline would read. Public copy about history length SHALL match this behaviour until per-plan windows ship with billing.

#### Scenario: Old busy Check
- **WHEN** a Check has 100,000 runs and the sweep completes a rotation
- **THEN** only runs newer than 90 days or within the newest 35 remain

#### Scenario: Quiet Check with an old baseline
- **WHEN** a Check's 30 most recent PASS runs are all older than 90 days
- **THEN** they are retained by the floor and the next verdict still has its baseline

#### Scenario: Heartbeat streak on a quiet Check
- **WHEN** a quiet Check has accumulated 35 recent heartbeat FAILs and its PASS baseline is older than the window
- **THEN** the PASS rows are still retained — the newest-rows floor does not displace the PASS floor

#### Scenario: Tick not running
- **WHEN** the cron is dead
- **THEN** no retention (or sample expiry) happens — documented in `docs/what-we-store.md` as depending on the tick

