# Claims — who is working on what

Claim a change **before** touching code: add/update your row and commit it (exact path). Release
by flipping `status` to `done` in your merge commit. Rules in [`AGENTS.md`](../AGENTS.md);
`owner` is a short session/agent name, `where` is the branch or worktree.

| change | owner | where | started | status |
|---|---|---|---|---|
| verdict-correctness | claude/prod-readiness | [PR #2](https://github.com/farjad-hasan/verifyruns/pull/2) | 2026-08-31 | done — merged 2026-09-01 |
| alert-delivery-durability | claude/prod-readiness | [PR #1](https://github.com/farjad-hasan/verifyruns/pull/1) | 2026-08-31 | done — merged 2026-09-01 |
| tick-run-durability | claude/prod-readiness | [PR #3](https://github.com/farjad-hasan/verifyruns/pull/3) | 2026-08-31 | done — merged 2026-09-01 |
| auth-session-hardening | claude/prod-readiness | [PR #4](https://github.com/farjad-hasan/verifyruns/pull/4) | 2026-08-31 | done — merged 2026-09-01 |
| run-retention | claude/prod-readiness | [PR #5](https://github.com/farjad-hasan/verifyruns/pull/5) | 2026-08-31 | done — merged 2026-09-01 |
| app-resilience | claude/prod-readiness | [PR #6](https://github.com/farjad-hasan/verifyruns/pull/6) | 2026-08-31 | done — merged 2026-09-01 |
| production-ops | claude/prod-readiness | [PR #7](https://github.com/farjad-hasan/verifyruns/pull/7) | 2026-08-31 | done — merged 2026-09-01 |
| pricing-tiers | — | — | — | deferred (activation: ≥10 external live Checks) |
| check-detail-phone | claude/design-audit (Mac) | [PR #9](https://github.com/farjad-hasan/verifyruns/pull/9) | 2026-09-03 | done — merged 2026-09-03, archived |
| public-page-shell | claude/design-audit (Mac) | worktree `../verifyruns-public-page-shell`, branch `public-page-shell` | 2026-09-03 | in progress — findings in `docs/design-audit-2026-09-02.md` Part 1 |
| dogfood-fleet | claude/dogfood (Mac) | worktree `../verifyruns-dogfood-fleet`, branch `dogfood-fleet` | 2026-09-03 | in progress — docs here, helper + Checks in farjad-world |
| heartbeat-schedule-window | claude/dogfood (Mac) | worktree `../verifyruns-heartbeat-schedule-window`, branch `heartbeat-schedule-window` | 2026-09-03 | in progress |
| unreachable-destination-recipe | claude/dogfood (Mac) | worktree `../verifyruns-unreachable-destination-recipe`, branch `unreachable-destination-recipe` | 2026-09-03 | in progress — docs only, sequential after dogfood-fleet |

All seven production-readiness changes were implemented as a **stacked PR chain** (#1→#7, one
session, sequential — the overlap table below made parallel claims impractical for this set) and
merged to main on 2026-09-01 and **deployed the same day** (Worker `5096069c`, Pages `62964528`;
staging first per `docs/deploy.md`, migrations before code, smoke green in both envs). All seven
changes are archived under `openspec/changes/archive/2026-08-31-*`. The operator actions are all
done too (see `docs/deploy.md` for the records): restore rehearsal 2026-09-02, external uptime
monitor + forced-failure verification 2026-09-01 (UptimeRobot), keys into Bitwarden 2026-09-02.
Nothing on the production-readiness board remains open.

## File overlaps (from each proposal's Impact list — check before claiming in parallel)

- `docs/dogfood.md`: **dogfood-fleet → unreachable-destination-recipe** (cross-link) → sequential. `heartbeat-schedule-window` touches `CheckDetail.jsx` and `ExpectationsFields.jsx` only; it stays out of `PublicStatus.jsx` (public-page-shell).

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
