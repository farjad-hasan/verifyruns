# What VerifyRuns stores

Honest as of 2026-08-27. This will tighten when `openspec/changes/data-minimisation` lands; until then, read this before pointing a Check at a table with personal data.

## Per Check

- Name, connector kind, and connector config. Bearer tokens, Airtable PATs, Postgres connection strings and Slack webhook URLs are **Fernet-encrypted at rest** and only ever returned masked to the last four characters.
- Expectations, the webhook secret, snooze state, and the last alerted verdict.

## Per run

- Timestamp, trigger, verdict, and the diff message.
- The **fingerprint**: record count, sample size, the set of field names, per-field empty-percentages, and — today — the **newest record and the five newest records in full**, unencrypted. For an orders or CRM table that means names, emails and amounts sit in the run history.
- On fetch errors, up to 500 characters of the destination's response body.
- The claimed count from the webhook body, if one was sent.

Runs are kept until the Check is deleted; deleting a Check deletes all of its runs. There is no account-deletion endpoint yet.

## What is never stored

- Your workflow, its credentials, or anything except the single HTTP POST it sends to the webhook (whose body is only read for an integer count).
- Destination data beyond the sample described above.

## Public status pages

A public status page exposes the Check's name, connector kind, and the last 30 verdicts with their diff messages — never config, secrets, fingerprints or sample records.

## Planned

`data-minimisation` replaces the stored sample with a hash by default, makes raw samples opt-in with a 30-day expiry, and redacts error bodies. The activation trigger is the first agency conversation.
