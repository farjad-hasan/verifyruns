# Claims — who is working on what

Claim a change **before** touching code: add/update your row and commit it (exact path). Release
by flipping `status` to `done` in your merge commit. Rules in [`AGENTS.md`](../AGENTS.md);
`owner` is a short session/agent name, `where` is the branch or worktree.

| change | owner | where | started | status |
|---|---|---|---|---|
| verdict-correctness | — | — | — | open |
| alert-delivery-durability | — | — | — | open |
| tick-run-durability | — | — | — | open |
| auth-session-hardening | — | — | — | open |
| run-retention | — | — | — | open |
| app-resilience | — | — | — | open |
| production-ops | — | — | — | open |
| pricing-tiers | — | — | — | deferred (activation: ≥10 external live Checks) |

## File overlaps (from each proposal's Impact list — check before claiming in parallel)

- `worker/src/tick.ts`: **tick-run-durability + run-retention** → sequential (durability first;
  retention adds its sweep to the bounded tick).
- `worker/src/routes.ts`: **auth-session-hardening + production-ops + run-retention** → any two
  can collide; smallest surface is run-retention (`deleteMe` only). Sequence or coordinate.
- `worker/src/crypto.ts`: **alert-delivery-durability + auth-session-hardening** → sequential,
  either order (decrypt failure vs JWT/hash — different functions, same file).
- `worker/src/env.ts`: **tick-run-durability + run-retention** → trivial additive collision;
  merge carefully.
- `frontend/src/pages/CheckDetail.jsx` and `PublicStatus.jsx`: **app-resilience +
  production-ops** → app-resilience first; production-ops' confirm/noindex bits rebase on it.
- `docs/security.md`: **alert-delivery-durability + auth-session-hardening**;
  `docs/deploy.md`: **tick-run-durability + run-retention + production-ops** → docs-only,
  resolve at merge.
- `production-ops` explicitly **depends on** tick-run-durability (ok-stamp) and
  alert-delivery-durability (failure counter) — claim it last.

Safe to run in parallel right now (disjoint Impact lists): **verdict-correctness** (engine/
connectors/docs) ∥ **app-resilience** (frontend) ∥ one of {tick-run-durability,
alert-delivery-durability, auth-session-hardening}.
