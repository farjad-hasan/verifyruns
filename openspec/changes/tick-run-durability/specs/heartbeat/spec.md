## ADDED Requirements

### Requirement: Tick work is bounded and indexed
Each tick sweep (heartbeats, retry drain, queue drain) SHALL process at most `VR_TICK_BATCH` items (default 25), leaving the remainder for the next tick. The heartbeat sweep SHALL select due Checks by a maintained `next_heartbeat_due_at` column over a partial index (one range scan, no per-Check follow-up queries); `pending_runs` and `pending_retry` sweeps SHALL be served by partial indexes so tick cost is proportional to due work, not tenant count. The in-statement duplicate guard on heartbeat inserts remains the correctness backstop.

#### Scenario: Many tenants, little work
- **WHEN** 3,000 Checks exist and none has due work
- **THEN** the tick issues indexed queries that scan no full table

#### Scenario: Backlog larger than the batch
- **WHEN** 60 heartbeat windows are due at once
- **THEN** 25 are processed this tick and the rest within the following ticks, each exactly once

### Requirement: Tick completion is recorded separately from start
A tick SHALL stamp `tick_last_ok_at` in `meta` as its final act on successful completion, distinct from the start stamp used for the lazy-tick claim, so a tick that starts and then throws every invocation is observable as stale.

#### Scenario: Tick throws every run
- **WHEN** every tick since 10 minutes ago has thrown after starting
- **THEN** `tick_last_ok_at` is 10 minutes old while the start stamp is fresh
