# Privacy policy

Canonical text of https://verifyruns.pages.dev/privacy. Last updated 2026-08-29.

Short, because the product stores little. This page says what VerifyRuns keeps about you and your destinations, who else touches it, and how to make it go away.

## Who runs VerifyRuns

VerifyRuns is operated by Farjad Hasan, an individual developer, from Pakistan. Questions and requests about your data go to farjad.developer@gmail.com.

## What we collect and why

Everything below exists to do one job: re-read a destination your automation wrote to and tell you whether it really changed.

- **Account:** your email address and a salted PBKDF2 hash of your password, so you can log in. We never see the password itself.
- **Checks:** the name, destination and expectations you configure. Bearer tokens, Airtable tokens, Postgres connection strings and alert targets (Slack/Discord webhook URLs, email addresses) are encrypted with AES-256-GCM before they are stored and are only ever shown back masked to the last four characters. They are used solely to read the destination and to deliver your alerts.
- **Runs:** per run, a timestamp, the verdict, the diff sentence, the count your workflow claimed, and a fingerprint of the destination — record count, field names, per-field empty rates and a SHA-256 hash of the newest record. Not the rows. See `what-we-store.md` for the exact list.
- **Raw samples, only if you turn them on:** the five newest records and up to 500 characters of an upstream error, kept about 30 days and then deleted automatically.
- **Pricing interest:** if you click a plan on the pricing page, the plan and any note you type, with your email.
- **Password resets:** a hash of the one-time token, for one hour.
- **Not stored:** IP addresses are counted in memory for rate limiting and never written down. There are no analytics or advertising trackers and no cookies; your session token lives in your browser's local storage.

## Your destinations

When a Check runs, VerifyRuns connects to the destination you configured — an HTTP endpoint, an Airtable base or a Postgres database — using the credentials you gave it, reads enough to count records and look at the newest ones, and keeps only the fingerprint described above. Postgres sessions are opened read-only. Destinations must be publicly reachable; the service refuses private and internal addresses.

## Who else touches the data

Two providers, and nothing is sold or shared for advertising.

- **Cloudflare** hosts the application, the API and the database (Workers, Pages and D1), primarily in the Asia-Pacific region, and keeps short-lived operational logs of requests and errors.
- **Resend** sends password-reset emails and email alerts, and therefore sees the recipient address and the alert text.

## How long we keep it

- Account, Checks and runs: until you delete the Check or the account.
- Raw samples: about 30 days from the run.
- Password-reset tokens: one hour, or until used.
- Operational logs at Cloudflare: a few days, on Cloudflare's schedule.

## Deleting and exporting

Delete account (the bin icon next to Sign out) removes your Checks, runs, samples, pricing interest, reset tokens and the account itself immediately — no soft delete, no retention window. Deleting a Check removes its runs and samples. For a copy of what we hold about you, email farjad.developer@gmail.com from the account address.

## If something goes wrong

If we learn that stored credentials or account data were exposed, we will email affected accounts within 72 hours with what happened and what to rotate. Security details and the disclosure address are in `security.md`.

## Changes

This policy changes when the product does. The date at the top moves and material changes are announced by email to account holders before they take effect.
