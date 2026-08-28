# postgres-on-workers

## Why

The first live Postgres Check from the Cloudflare build (2026-08-28, Supabase pooler) failed after 12 s with "Postgres connection error: Error." and the stored detail "Too many subrequests by single Worker invocation". Root cause, isolated with raw `cloudflare:sockets` probes: the pooler answers `S` to SSLRequest and `startTls()` returns, but the first TLS write fails — workerd rejects the handshake, consistent with Supabase's private CA ("Supabase Intermediate 2021 CA"); the identical sequence against a public-CA host succeeds, and plain TCP to the pooler works (50 rows in 1.1 s). postgres.js then reconnects in a loop until the 50-subrequest budget is gone, so the user sees a slow, opaque failure. node-postgres (`pg`) fails the same TLS way but in one attempt (~0.5 s) with a stable message, and carries a native Workers socket (`pg-cloudflare`).

## What changes

- The Postgres connector uses `pg` (bundled once with esbuild under the `workerd` export condition, vendored at `worker/src/vendor/pg.mjs`) instead of postgres.js: one connection attempt, `VR_PG_CONNECT_TIMEOUT_MS` (15 s), no reconnects.
- TLS is on unless the DSN says `sslmode=disable`; there is no silent downgrade. A TLS failure fails the run within one attempt with a message that names the likely cause and the options.
- Docs state the hosted-build limitation honestly: the database must present a publicly trusted certificate; providers with private CAs (Supabase, and by the same mechanism RDS and Cloud SQL — untested) need `sslmode=disable` (cleartext, only over a network you trust) or self-hosting. Hyperdrive (free plan, 10 configs per account) is the deferred path for a self-hoster's own database, not a per-Check mechanism.

## Out of scope

Hyperdrive integration; custom CA upload; verifying any public-CA Postgres provider end-to-end (none was available).
