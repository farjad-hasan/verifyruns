## Context

Observability today: Workers Logs in the dashboard (pull-only), `console.error` at failure sites, a health probe measuring tick start, and `monitor.yml` (30-min curl, honest about being a backstop). Backup content: one `wrangler d1 export` line in the self-hosting doc. One environment; `database_id` appears once in `wrangler.toml`.

## Goals / Non-Goals

**Goals:**
- Worker breakage pages the operator within minutes, from infrastructure that does not share fate with the repo or the Worker.
- A laptop loss or bad migration is a recoverable incident with a written, rehearsed procedure.
- Schema changes meet prod-shaped data before prod.
- Public status pages are shareable-by-link, not discoverable-by-crawler.

**Non-Goals:**
- Paid observability (Logpush, Sentry) — dashboard notifications + the external probe cover the current scale at $0.
- ENC_KEY rotation tooling — key-versioned ciphertexts are noted as the prerequisite and deferred; custody and backup make loss survivable first.
- Custom domain — tracked in `pricing-tiers` as a billing gate, not here.

## Decisions

- **Health = ok-stamp age + failure counter.** `ok: tick_ok_age_seconds <= VR_HEALTH_MAX_TICK_AGE_SECONDS`. `alert_delivery_failures` is reported but does not flip `ok` (a user's revoked Slack webhook must not page the operator); the external probe's keyword alerting can watch its delta. Response shape stays backward compatible (`tick_age_seconds` retained).
- **External probe over more GitHub.** The 60-day auto-disable is a structural trap for a solo repo that may go quiet; a monitoring vendor's free tier exists precisely for this. Configuration is documented in deploy.md (the service is not in the repo; the doc is the source of truth).
- **Staging via wrangler env**, not a second repo: `[env.staging]` with its own D1; `migrate:staging` script; the deploy checklist becomes staging-migrate → staging-deploy → smoke (`/api/health`, one webhook round-trip) → prod-migrate → prod-deploy. CI still gates with tests; staging is for data-shape rehearsal, not a second CI.
- **noindex belongs on the route** (meta tag set by the PublicStatus page) *and* in robots.txt — robots alone does not prevent indexing of linked URLs.

## Risks / Trade-offs

- [Staging D1 drifts from prod shape] → migrations are forward-only and applied to staging first by checklist; a quarterly `d1 export` diff is listed in the runbook.
- [External vendor dependency] → it sends email on failure and does nothing else; losing it returns us to today, observably (its own downtime alerts).
