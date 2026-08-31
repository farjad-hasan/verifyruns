## Context

`http.ts:26-29` returns `x-forwarded-for.split(",")[0]` before `cf-connecting-ip` — Cloudflare *appends* the real IP to a client-supplied XFF, so element 0 is attacker-chosen. `reset.ts` rewrites the hash and deletes other *reset* tokens but no JWT state. Hashes are `pbkdf2$100000$salt$hash`-shaped with the count baked into config, not the stored string.

## Goals / Non-Goals

**Goals:**
- Rate limits key on an IP the caller cannot choose.
- "Reset your password" is a complete account-recovery action: attacker sessions die.
- No observable difference between known and unknown emails on login.
- Hash strength meets current guidance without a big-bang migration.

**Non-Goals:**
- Account lockout, email verification, 2FA — still tracked as known absences in the auth spec.
- Durable (cross-isolate) rate limiting — the Cloudflare binding remains the named upgrade path.

## Decisions

- **`token_version` over a denylist.** `currentUser` already costs one user-row read per request; comparing an integer claim against a column is free and needs no new table or TTL sweep. JWTs without the claim (issued before deploy) are treated as version 0, matching the backfilled column default — existing sessions survive the deploy, and die on the owner's next reset.
- **Dummy-hash the same cost.** A constant fake salt+hash pair verified on unknown email; the comparison result is discarded. Keeps login one code path with one PBKDF2 either way.
- **Iterations live in the stored hash.** Format gains the count (already parsed positionally); verification uses the stored count, new hashes use `VR_PBKDF2_ITERATIONS`. Rehash-on-login upgrades organically; no bulk migration touching every user.
- **Fallback order for IP**: `cf-connecting-ip` → `request.socket` equivalent (none on Workers; use a constant "unknown" bucket) — never a client header. The "unknown" bucket rate-limits collectively, which only matters off-Cloudflare.

## Risks / Trade-offs

- [600k iterations ≈ 6× login CPU] → one login per session; measured against the Workers CPU budget in verification before shipping.
- [Version-0 grandfathering keeps pre-deploy stolen tokens alive until a reset] → acceptable; forcing global logout on deploy punishes everyone for no incident.
