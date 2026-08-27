## Context

The tick (`_tick`) is idempotent and cheap when nothing is due. The only reason it runs every N minutes rather than continuously is that nothing calls it in between. Traffic can.

## Goals / Non-Goals

**Goals:** heartbeat/retry latency ≈ 1 minute or "next request", whichever is sooner; an async webhook mode that cannot lose runs; Airtable counts that stay well inside the fetch budget; a scheduler that lives in the Cloudflare account already in use.

**Non-Goals:** exactly-once guarantees across multiple API replicas (one free instance); sub-minute heartbeat precision; removing the internal loop.

## Decisions

- **Claim before tick.** A `meta` document `{_id: "tick", last_at}` is created at startup. The lazy path does `find_one_and_update({_id: "tick", last_at: {$lt: now − 60 s}}, {$set: {last_at: now}})`; only the request that wins the update schedules `_tick()` as an `asyncio` task. The cron endpoint and the internal loop tick unconditionally and also stamp `last_at`, so traffic never ticks right after the scheduler did.
- **Lazy tick runs after the response, as a task**, never inline: a webhook must not wait for someone else's retry. On Render the process stays alive between requests, so the task completes; on a true function host it might not — which is exactly why the scheduler stays the floor.
- **Queued runs live on the Check as `pending_runs: [{run_id, claimed_new, body_note, queued_at}]`.** The drain atomically swaps the array for `[]` (`find_one_and_update` returning the old document) and executes the runs in order, so two ticks cannot both run them. `?wait=0` returns `202 {accepted, run_id, queued: true}`; the run id is pre-assigned so the caller can poll `/api/runs/{id}` (404 until executed).
- **Airtable: page one full, later pages one field.** `fields[]` takes a field *name*; the first field seen on page one is used (if page one has no fields, later pages are requested without the parameter — an empty-fields base is tiny anyway). Every page still returns `id` and `createdTime`, so the newest record is chosen over the whole set; when it is not on page one it is fetched with one extra `GET …/{recordId}`. The sample is page one plus that record, ordered newest-first; `sample_size` reports it.
- **Cloudflare Worker cron**: a 15-line Worker with a `scheduled` handler that POSTs to the tick URL with `TICK_SECRET` from `wrangler secret`. Free plan: cron triggers allowed, 100k requests/day; one request per minute is 1,440.

## Risks / Trade-offs

- [Lazy tick on a dashboard poll every 10 s] → at most one tick per 60 s per instance by construction.
- [Queued run executes up to a minute later] → chosen by the caller with `?wait=0`; the default is still inline.
- [`fields[]` with a field that later disappears] → Airtable returns records with empty `fields` rather than an error; the count is still right.
- [Extra single-record fetch] → one request, only when the newest record is off page one.
