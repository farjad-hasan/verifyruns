# What VerifyRuns stores

Updated 2026-09-05. The privacy policy is `privacy.md`; the terms are `terms.md`.

## Per Check

- Name, connector kind, and connector config. Bearer tokens, Airtable PATs, Postgres connection strings and alert-channel targets (Slack/Discord webhook URLs, email addresses) are **encrypted at rest with AES-256-GCM** and only ever returned masked to the last four characters.
- Expectations, heartbeat cadence, the webhook secret, snooze state, and the last alerted verdict.

## Per run

- Timestamp, trigger, verdict, and the diff message.
- The **fingerprint**: record count, sample size, the previous count observation, an opaque hash binding observations to destination configuration, read-success and count-accuracy flags, the set of field names, per-field empty-percentages, and a **SHA-256 hash of the newest record**.
- The claimed count from the webhook body, if one was sent; whether the workflow reported failure and the `error` string it sent (up to 500 characters — keep secrets out of it); and which alert channels were attempted — per channel, its kind, whether it delivered, and a short error string on failure. A single service-wide counter of failed alert deliveries is also kept (a number only — no targets, no message bodies).
- **No destination rows and no upstream response bodies** — unless the Check has **"Store raw samples"** turned on.

## How long runs are kept

Run rows are deleted once they are **older than 90 days** (`VR_RUN_RETENTION_DAYS`) — except that every Check always keeps its **newest 35 runs** and its **newest 30 PASS runs**, regardless of age, so the verdict engine's comparison baseline and the 30-square timeline are never touched by retention. The sweep runs as part of the periodic tick; when the tick is not running (dead cron on a self-host), neither retention nor sample expiry happens.

## When "Store raw samples" is on (off by default)

A separate `run_samples` record keeps, per run, the newest record, the five newest records, and up to 500 characters of an upstream error body. The database deletes it automatically about 30 days after the run — expiry, like run retention, depends on the tick running. Turning the setting off stops new samples; existing ones expire on schedule.

## Deletion

- Deleting a Check deletes its runs and samples.
- **Delete account** (the bin icon next to Sign out) deletes samples, runs, Checks, pricing-interest rows, password-reset tokens and the user record immediately, in one batch.

## What is never stored

- Your workflow, its credentials, or anything except the single HTTP POST it sends to the webhook — whose body is only read for an integer count, a boolean `failed` and an `error` string. Only a JSON boolean `true` counts as a reported failure — a forwarded payload that happens to carry `failed: "true"` or a `status` field cannot flip a run.
- Destination data beyond the fingerprint and, if opted in, the short-lived sample above.

## Public status pages

A public status page exposes the Check's name, connector kind, and the last 30 verdicts with their diff messages — never config, secrets, fingerprints or samples. A reported failure shows only the fixed sentence "Your workflow reported failure." there; the workflow's own reason stays with the account.

## Runs written before 2026-08-27

Runs recorded by earlier builds may still hold raw newest-record data in the run document itself. Delete the Check (or the account) to purge them; they are not migrated automatically.
