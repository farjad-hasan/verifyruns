## MODIFIED Requirements

### Requirement: Traffic can drive the tick
On any API request, if more than `VR_LAZY_TICK_SECONDS` (default 300; `0` disables) have passed since the last tick, the system SHALL claim the tick atomically in the database and run it in the background after the response. The lazy tick is the fallback for hosts without a cron trigger; the production cron covers the minute cadence. Concurrent requests SHALL NOT produce more than one tick per window, and the scheduler endpoint and internal loop SHALL stamp the same timestamp so traffic does not tick right after them.

#### Scenario: Busy instance
- **WHEN** the last tick was 6 minutes ago and a dashboard request arrives
- **THEN** exactly one tick runs after that response and the timestamp advances

#### Scenario: Quiet instance
- **WHEN** no request arrives for 10 minutes
- **THEN** the external scheduler's call is what runs the tick

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
