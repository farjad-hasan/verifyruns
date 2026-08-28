## Why

The app collects email addresses and stores third-party credentials (bearer tokens, Airtable PATs, Postgres connection strings) and there is no terms-of-service or privacy policy anywhere in the repo or the site. `/data` says what is stored but is not a policy: it names no operator, no sub-processors, no retention for account data, no contact, and no governing terms. Agencies ask for this before they paste a production DSN. Third blocker in the 2026-08-29 review.

## What Changes

- `/terms` and `/privacy` as public SPA routes, linked from the landing footer, the sign-up form ("By creating an account you agree to…") and `/data`.
- `docs/terms.md` and `docs/privacy.md` as the canonical text; the pages render the same content.
- Content is short, specific to what the code does, and marked early-access: operator, what is collected and why, sub-processors (Cloudflare, Resend), retention, deletion, security-incident notice, no warranty, termination, changes, contact.

## Capabilities

### Modified Capabilities
- `marketing-site`: two more public pages, linked from every entry point.

## Impact

Frontend: two pages, `App.js`, `Landing.jsx` footer, `AuthPage.jsx`, `DataPage.jsx`. Docs: two new files, README link.
