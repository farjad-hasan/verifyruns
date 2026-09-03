## Why

The connectors read Airtable, an HTTP endpoint or a hosted Postgres — destinations on the public internet. A job whose destination is a laptop, a NAS, a database behind a VPN or a file on disk cannot be verified as-is, and today the product says nothing about it; the user discovers it at "create Check" and leaves. The dogfood fleet hit this on every job and settled on a workaround that generalises: the job appends one row to a small cloud-readable table and VerifyRuns verifies *that*. It is honest about what it proves (the job ran and reached the end) and what it does not (the real destination changed), which is exactly the distinction the product is built on.

This is a **documentation page, not a feature**, and it is not linked from the marketing site. Linking it is a positioning decision — "we serve jobs whose destination we cannot see" — that waits for a trigger: an early-access signup asking for it, or a deliberate decision to widen the persona. Until then the page exists so the answer is ready when the question arrives.

**Activation trigger for linking:** first external user who asks, or the persona decision recorded in `PRODUCT.md`.

## What Changes

- `docs/unreachable-destination.md`: when this applies; what a run-table check proves and does not; the table shape (`job, exit, at, note`); the Supabase recipe with RLS (insert-only from the job, select for the reader); the `http_json` Check settings (`growth_mode: claimed`, `min_new_records: 1`, heartbeat); the one-line wrapper pattern in any language (`cmd; curl … -d '{"wrote":1}'`); the heartbeat as the part that catches the job that never started.
- No route, no nav link, no landing copy. `docs/what-we-store.md` unchanged (rows are the user's own table).

## Capabilities

### Modified Capabilities
- `project-docs`: the repository explains the unreachable-destination pattern and its limits.

## Impact

- `docs/unreachable-destination.md` (new); `docs/dogfood.md` gets a cross-link once `dogfood-fleet` merges (sequential after it)
- Not touched: `frontend/`, `README.md` (no link until the trigger fires), `PRODUCT.md`
