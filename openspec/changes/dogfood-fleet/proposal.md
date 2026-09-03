## Why

VerifyRuns has one live Check: the three brand jobs on Farjad's Mac share a single webhook and a single 28 h heartbeat. That is enough to prove the loop works and not enough to find the bugs a stranger will find — alert de-duplication across many Checks, recovery messages, heartbeat timing at 1 h versus 170 h cadences, the dashboard at eight rows. The same machine runs a second, larger fleet (the work chief-of-staff jobs: a nightly money-touching sweep, two daily headless briefs, a weekly retention check, an hourly sweep) whose failure modes are the product's origin story: a job hits a lock or a tunnel, exits 0 or exits quietly, and nobody is told. One of them hand-rolls a "three silent skips before anyone hears" alarm — the feature this product sells.

This change turns the whole machine into the test fleet: one Check per job, each with its own cadence. It changes no product code. What it produces is run history under real cadences and two documented failure modes to catch — the raw material for `heartbeat-schedule-window` and for whatever the next week of verdicts shows.

**Boundary, decided up front.** The work fleet's rows carry neutral job labels (`work-nightly-sweep`, not the product or client name) and `{"wrote": 1}`, never a real record count. Check names are what appears on `/status/:token`; nothing there may identify a client, product or colleague. The wiring of the work jobs is done from the work repo's own agent session — this repo and `farjad-world` only ship the helper, the table, the Checks and a handoff note.

## What Changes

- `docs/dogfood.md`: the fleet table (job, cadence, heartbeat, check name), the run-table pattern (job appends one row to a Supabase table the edge can read; VerifyRuns reads it back), the label/count policy above, and how to add a job.
- Outside this repo, tracked here as tasks: `farjad-world/scripts/report_run.py` — the existing `brand_state.report_run` extracted into a standalone stdlib CLI that wraps any command (`report_run.py --job NAME -- cmd…`), reports the exit code, never alters it; Supabase table `fleet_runs` with RLS matching `brand_runs`; one Check per job; the farjad-world-owned nightly index job wired directly; a handoff note for the work repo's session.

## Capabilities

### Modified Capabilities
- `project-docs`: the repository documents its own dogfood fleet and the run-table pattern.

## Impact

- `docs/dogfood.md` (new), `README.md` (one link under self-hosting/what-we-store)
- Outside the repo: `farjad-world/scripts/report_run.py` + tests, `farjad-world/docs/machine-setup.md`, `~/Library/LaunchAgents/com.farjad.cos-kb-reindex.plist` (machine state), `~/.verifyruns-dogfood.env` (per-job hooks), Supabase project `kcofxrdmuzbfmpjeukgx` (`fleet_runs`)
- Not touched: any product code; `~/opg-world` (read-only from the personal side — its jobs are wired by its own session from the handoff note)
