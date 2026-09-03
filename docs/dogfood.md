# Dogfood fleet

Every scheduled job on the maintainer's Mac reports to VerifyRuns. This is the product's
test harness under real cadences: one Check per job, its own heartbeat, the same alert
channels. It changes nothing in the product; it produces run history, and it catches the
failure the product was built from — a job that exits quietly and nobody is told.

## The pattern: a run table the edge can read

None of these jobs writes to a destination the Worker can reach (local files, local SQLite,
a database behind a VPN). So each job, on exit, appends **one row** to a small Supabase
table the Worker *can* read, then tells VerifyRuns `{"wrote": 1}`. The Check reads that
table back, expects one new row per run, and heartbeats when nothing arrives.

What a run-table Check proves: the job reached its end and said so. What it does not prove:
that the job's real destination changed — nor that the job *succeeded*. Verified 2026-09-03
with a forced failure: a command that exits 1 still writes its row (`exit: 1`) and the Check
PASSes ("Destination gained 1 record(s), matching what your workflow reported"). The exit code
is in the row for a human to read; VerifyRuns has no rule for it. That is a product gap the
fleet surfaced, not something the wrapper should hide — a job that reports its own failure is
a different fact from a job that never reported, and today only the second one is a FAIL.
The Check name says `→ Supabase fleet_runs` so nobody reads more into a PASS than it carries.

Table (`fleet_runs`, project `kcofxrdmuzbfmpjeukgx`), same shape as the older `brand_runs`:

| column | type | note |
|---|---|---|
| `job` | text | the label; RLS allows only the allowlisted values |
| `exit` | int | the job's exit code, unchanged (143 = killed by launchd's cap) |
| `at` | timestamptz | when the job finished |
| `note` | text ≤ 500 | free text; the wrapper's `--note` |

RLS: `anon` may `SELECT` everything and `INSERT` only allowlisted labels with a note ≤ 500
characters. The publishable key is public by design; it is in the Check's read URL as
`?apikey=`.

## The fleet

| label | what it is | cadence | heartbeat |
|---|---|---|---|
| `brand-brief` / `brand-produce` / `brand-harvest` | brand fleet (writes `brand_runs`, one shared Check) | daily 13:45 / on inbox change / Fri 08:00 | 28 h |
| `kb-reindex` | nightly search-index rebuild | daily 03:30 | 26 h |
| `work-nightly-sweep` | nightly reconciliation sweep, posts a summary to a channel | daily 23:00 | 26 h |
| `work-morning-brief` | headless morning brief | daily 13:30 | 25 h |
| `work-eod-brief` | headless end-of-day brief | daily 23:30 | 25 h |
| `work-weekly-retention` | weekly recording-availability worklist | Mon 10:00 | 170 h |
| `work-hourly-sweep` | hourly sweep, 13:00–23:00 only | hourly in window | 2 h — needs the `heartbeat-schedule-window` window 13:00–23:00 Asia/Karachi, else it FAILs every night |

All Checks: `http_json`, `growth_mode: claimed`, `min_new_records: 1`, required fields
`job, exit, at`. Times are Asia/Karachi.

**Label policy.** Labels are neutral: no client, product, repository or colleague name —
the Check name appears on the public status page, and the `work-*` jobs belong to a
separate, confidential codebase. `work-*` jobs always send `{"wrote": 1}`, never a real
record count.

## Adding a job (four steps)

1. Add the label to the `fleet_runs_insert` policy allowlist (Supabase → Policies).
2. Create the Check: HTTP/JSON,
   `https://<project>.supabase.co/rest/v1/fleet_runs?job=eq.<label>&select=id,job,exit,at,note&order=at.desc&apikey=<publishable>`,
   claimed mode, min 1 new record, heartbeat a little longer than the job's longest normal gap.
3. Put its webhook in `~/.verifyruns-dogfood.env` as `VERIFYRUNS_HOOK_<LABEL>` (upper-case, `-`→`_`).
4. Wrap the job's command:
   `/usr/bin/python3 /Users/farjad/farjad-world/scripts/report_run.py --job <label> -- <original command>`.
   The wrapper returns the command's exit code unchanged and never raises; with no env file
   it is a no-op wrapper. Test it once by hand: `report_run.py --job <label> -- /usr/bin/true`
   should print `{"sink": 201, "verifyruns": 200}` and the Check should show a PASS.

The wrapper and its tests live in `farjad-world/scripts/report_run.py`; the brand jobs'
`brand_state.report_run` delegates to it, so there is one implementation.
