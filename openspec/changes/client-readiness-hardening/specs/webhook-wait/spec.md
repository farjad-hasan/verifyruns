## ADDED Requirements

### Requirement: Manual runs are durably queued
POST /api/checks/{id}/run SHALL persist the job before returning its run_id and queued status. Immediate background processing MAY accelerate execution but SHALL not be the only copy. The scheduler SHALL resume jobs interrupted before their run is recorded, preserve trigger=manual, and reconcile recorded jobs without another destination read. Concurrent drains SHALL use renewable per-Check leases; abandoned leases SHALL expire.

#### Scenario: Background invocation is cancelled
- **WHEN** the response is sent and background processing is cancelled before recording the manual run
- **THEN** the job remains queued and a later scheduler tick records that same run_id

#### Scenario: Concurrent manual and scheduled drains
- **WHEN** two workers try to drain the same Check
- **THEN** only the lease owner executes its queued jobs while the lease remains valid
