## Why

A workflow that knows it failed has no way to tell VerifyRuns. Verified 2026-09-03 on the dogfood fleet: a job that exited 1 still wrote its run row and the Check PASSed — "Destination gained 1 record(s), matching what your workflow reported." The exit code sat in the row for a human to read; no rule reads it. Today the only failure VerifyRuns can see is *silence* (heartbeat) or a *destination that disagrees*; "the job itself said it failed" is a third fact, and it is the one every automation tool already emits — n8n's error workflow, Make's error handler, a cron wrapper's exit code. Letting the webhook carry it is the smallest change that turns those signals into the same FAIL → alert → Recovered loop the rest of the product runs on.

## What Changes

- The webhook body may carry a boolean `"failed": true` and an optional `"error"` string (≤ 500 chars, newlines collapsed). Such a run is a FAIL regardless of what the destination shows, with the sentence "Your workflow reported failure: <error>." (or "… reported failure (no reason given)."; when the destination could not be read either, the read error is appended). Only a JSON boolean counts — a bare `status` key is the forwarded-payload hazard that got `count` removed, and a non-boolean `failed` is noted on the run like a bad `wrote`. `wrote` may accompany it and is stored as before.
- The destination is still read and fingerprinted so the run carries the same evidence as any other, but a reported failure never joins the PASS baseline.
- A reported failure is **not** retried before alerting, and it cancels a retry left by an earlier ordinary FAIL: retrying re-reads the destination, which cannot change what the workflow said, and a passing retry would silently swallow the alert or send a false Recovered. The alert goes out on the first reported failure (subject to snooze and dedup as usual); the next non-failed PASS recovers.
- The public status page shows the fixed sentence "Your workflow reported failure." — the workflow-supplied reason stays with the owner. In chat channels the reason is inert: Discord payloads carry `allowed_mentions: {parse: []}` and Slack text is escaped.
- `?wait=0` queued runs carry the failure fields; the run and its API read expose `reported_failure` and `reported_error`.
- Docs: README webhook step, `docs/n8n.md` (error workflow → same hook with `failed: true`), `docs/make.md`, `docs/zapier.md`, `docs/unreachable-destination.md` and `docs/dogfood.md` (the known-limit paragraphs become the feature). Outside this repo: `farjad-world/scripts/report_run.py` sends `failed: true` with `error: "exit N"` on any non-zero exit (a lock-skip, exit 75, is a failure too — the brief never ran that day, which is the origin story).
- Not in scope: the n8n community node option (separate repo, follow-up), and a per-Check switch to ignore reported failures — nobody has asked.

## Capabilities

### Modified Capabilities
- `checks`: webhook body gains `failed`/`error`; run records gain `reported_failure`/`reported_error`; the public page masks the reason.
- `alerts`: retry-before-alert is skipped and any pending retry cancelled for reported failures; chat payloads neutralise mentions and markup.

## Impact

- `worker/migrations/0006_reported_failure.sql` (two nullable columns on `check_runs`)
- `worker/src/engine.ts` (`parseReported`), `worker/src/execute.ts` (forced verdict, no retry), `worker/src/routes.ts` (webhook + run reads + public masking), `worker/src/alerts.ts` (Discord `allowed_mentions`, Slack escaping), `worker/src/tick.ts` (queued-run plumbing), `worker/src/checks.ts` (`pending_runs` item type)
- `worker/test/engine.test.ts`, `worker/test/runs.test.ts`, `worker/test/alerts.test.ts`, `worker/test/public.test.ts`
- `README.md`, `docs/n8n.md`, `docs/make.md`, `docs/zapier.md`, `docs/dogfood.md`, `docs/unreachable-destination.md`, `docs/what-we-store.md` (the error string is stored)
- Frontend: none required (the sentence is the UI). `PublicStatus.jsx` untouched.
- Outside the repo: `farjad-world/scripts/report_run.py` + tests
