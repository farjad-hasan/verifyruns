## MODIFIED Requirements

### Requirement: Account deletion leaves nothing behind
`DELETE /api/auth/me` SHALL delete the user's run samples, runs, Checks, pricing-interest rows and password-reset tokens, and then the user row, chunking statements to stay under the database's batch and bind limits so accounts of any size delete completely; the user row SHALL be deleted last, so a partial failure leaves a retryable account rather than orphaned rows. Afterwards no table SHALL hold the user's id or email.

#### Scenario: User who registered interest deletes the account
- **WHEN** a user has posted to `/api/interest` and then calls `DELETE /api/auth/me`
- **THEN** the response is 200, the token stops working, and `interest` has no row with that user id or email

#### Scenario: Account with hundreds of Checks
- **WHEN** a user with 300 Checks calls `DELETE /api/auth/me`
- **THEN** every row is deleted across multiple batches and the response is 200

## ADDED Requirements

### Requirement: Run history is bounded
The tick SHALL delete `check_runs` rows that are both older than `VR_RUN_RETENTION_DAYS` (default 90) and beyond the newest `VR_RUN_RETENTION_MIN` (default 35) rows of their Check, in bounded batches over a rotating cursor. The floor SHALL exceed the verdict baseline window so retention can never remove a run the engine or the 30-square timeline would read. Public copy about history length SHALL match this behaviour until per-plan windows ship with billing.

#### Scenario: Old busy Check
- **WHEN** a Check has 100,000 runs and the sweep completes a rotation
- **THEN** only runs newer than 90 days or within the newest 35 remain

#### Scenario: Quiet Check with an old baseline
- **WHEN** a Check's 30 most recent PASS runs are all older than 90 days
- **THEN** they are retained by the floor and the next verdict still has its baseline

#### Scenario: Tick not running
- **WHEN** the cron is dead
- **THEN** no retention (or sample expiry) happens — documented in `docs/what-we-store.md` as depending on the tick
