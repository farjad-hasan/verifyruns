# What VerifyRuns stores

True as of 2026-08-29 (`deletion-purges-everything` shipped). The privacy policy is `privacy.md`; the terms are `terms.md`.

## Per Check

- Name, connector kind, and connector config. Bearer tokens, Airtable PATs, Postgres connection strings and alert-channel targets (Slack/Discord webhook URLs, email addresses) are **encrypted at rest with AES-256-GCM** and only ever returned masked to the last four characters.
- Expectations, heartbeat cadence, the webhook secret, snooze state, and the last alerted verdict.

## Per run

- Timestamp, trigger, verdict, and the diff message.
- The **fingerprint**: record count, sample size, the set of field names, per-field empty-percentages, and a **SHA-256 hash of the newest record** — enough to tell "unchanged" from "changed", not enough to reconstruct the row.
- The claimed count from the webhook body, if one was sent, and which alert channels were attempted.
- **No destination rows and no upstream response bodies** — unless the Check has **"Store raw samples"** turned on.

## When "Store raw samples" is on (off by default)

A separate `run_samples` record keeps, per run, the newest record, the five newest records, and up to 500 characters of an upstream error body. The database deletes it automatically about 30 days after the run. Turning the setting off stops new samples; existing ones expire on schedule.

## Deletion

- Deleting a Check deletes its runs and samples.
- **Delete account** (the bin icon next to Sign out) deletes samples, runs, Checks, pricing-interest rows, password-reset tokens and the user record immediately, in one batch.

## What is never stored

- Your workflow, its credentials, or anything except the single HTTP POST it sends to the webhook — whose body is only read for an integer count.
- Destination data beyond the fingerprint and, if opted in, the short-lived sample above.

## Public status pages

A public status page exposes the Check's name, connector kind, and the last 30 verdicts with their diff messages — never config, secrets, fingerprints or samples.

## Runs written before 2026-08-27

Runs recorded by earlier builds may still hold raw newest-record data in the run document itself. Delete the Check (or the account) to purge them; they are not migrated automatically.
