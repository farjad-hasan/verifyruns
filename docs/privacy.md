# Privacy policy

Canonical text of https://verifyruns.pages.dev/privacy. Last updated: 2026-09-14.

Short, because the product stores little. This page says what VerifyRuns keeps about you and your destinations, who else touches it, and how to make it go away.

## Who runs VerifyRuns

VerifyRuns is operated by Farjad Hasan, an individual developer, from Pakistan. Questions and requests about your data go to farjad.developer@gmail.com.

## What we collect and why

Everything below exists to do one job: re-read a destination your automation wrote to and tell you whether it really changed.

- **Account:** your email address and a salted PBKDF2 hash of your password, so you can log in. Passwords are hashed before storage.
- **Checks:** the name, destination and expectations you configure. Bearer tokens, Airtable tokens, Postgres connection strings and alert targets (Slack/Discord webhook URLs, email addresses) are encrypted with AES-256-GCM before they are stored and are only ever shown back masked to the last four characters. They are used solely to read the destination and to deliver your alerts.
- **Runs:** per run, a timestamp, the verdict, the diff sentence, the count your workflow claimed, any reported failure and supplied error text (up to 500 characters), delivery outcomes, and a fingerprint of the destination — record count, its previous observation, count-accuracy flags, an opaque destination-configuration hash, field names, per-field empty rates and a SHA-256 hash of the newest record. Not the rows. See `what-we-store.md` for the exact list.
- **Raw samples, only if you turn them on:** up to five sampled destination records and up to 500 characters of an upstream error, kept about 30 days and then deleted automatically.
- **Pending work:** queued runs retain their run ID, trigger, count and supplied failure metadata until recorded. Pending notifications retain the Check name, original message/time, encrypted targets and attempt results until accepted or cancelled by removing the targets or deleting the Check. Their original runs are retained while pending.
- **Pricing interest:** if you click a plan on the pricing page, the plan and any note you type, with your email.
- **Password resets:** a hash of the one-time token, for one hour.
- **Not stored:** The application uses IP addresses in memory for rate limiting; hosting-provider request logs may include connection metadata. There are no analytics or advertising trackers and no cookies; your session token lives in your browser's local storage.

## Your destinations

When a Check runs, VerifyRuns connects to the destination you configured — an HTTP endpoint, an Airtable base or a Postgres database — using the credentials you gave it, reads enough to count records and look at the newest ones, and keeps only the fingerprint described above. Postgres sessions are opened read-only. Destinations must be publicly reachable; the service refuses private and internal addresses.

## Who else touches the data

Cloudflare hosts the service. Resend will send email when password reset or alert email is enabled. Configured Slack or Discord webhooks receive alert text through the destination you choose. Nothing is sold or shared for advertising.

- **Cloudflare** hosts the application, the API and the database (Workers, Pages and D1), and processes operational request and error logs according to the hosting configuration.
- **Resend** will send password-reset (and later alert) email when those features are enabled, and would then see the recipient address and the message text. Neither is live until a verified sending domain is configured.

## How long we keep it

- Account and Checks: until you delete them. Runs: 90 days, retaining at least the newest 35 runs and newest 30 PASS runs per Check regardless of age, plus runs with pending notifications until resolved; deleting a Check or account removes them.
- Raw samples: about 30 days from the run, removed by the periodic cleanup task.
- Password-reset tokens: one hour, or until used.
- Operational logs: retained according to the configured Cloudflare logging service.

## Deleting and exporting

Delete account (the bin icon next to Sign out) removes your Checks, runs, samples, pricing interest, reset tokens, pending work and the account itself immediately — no soft delete, no retention window. Deleting a Check removes its runs, samples and pending work. For a copy of what we hold about you, email farjad.developer@gmail.com from the account address.

## If something goes wrong

If we learn that stored credentials or account data were exposed, we will email affected accounts within 72 hours with what happened and what to rotate. Security details and the disclosure address are in `security.md`.

## Changes

This policy changes when the product does. The date at the top moves and material changes are announced by email to account holders before they take effect.
