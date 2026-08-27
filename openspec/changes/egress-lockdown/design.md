## Context

Any signed-up user can point a Check at any URL or Postgres host, and the server fetches it. On a shared or cloud host that is an SSRF path into the private network and cloud metadata. Sign-up, login and the webhook have no rate limits. The local dev stack itself relies on private egress (Docker Postgres on localhost, the test alert catcher on 127.0.0.1), so the policy must be switchable by environment and must be enforced by the running server, not only by code that tests can monkeypatch.

## Goals / Non-Goals

**Goals:**
- Refuse private, loopback, link-local, metadata, multicast and reserved addresses for every destination — at save time (clear 400) and again at fetch time (DNS can change).
- Cap what a destination fetch can pull into memory and how long it may run.
- Rate-limit the three abuse surfaces: auth per client IP, webhook per secret, Check creation per user.
- A single switch (`VR_ALLOW_PRIVATE_EGRESS=1`) for self-hosters who *want* to watch an internal database — off by default.

**Non-Goals:**
- Allow-lists per user, egress proxies, DNS pinning between resolve and connect (documented residual risk).
- Distributed rate limiting (in-memory per process is enough for one API process).
- Email verification / password reset (separate change).

## Decisions

- **Policy is one pure function, `_egress_violation(target, allow_private) -> Optional[str]`,** taking a URL or a Postgres DSN, resolving the host with `socket.getaddrinfo`, and rejecting if *any* resolved address is non-global per `ipaddress` (`is_private`, `is_loopback`, `is_link_local`, `is_multicast`, `is_reserved`, `is_unspecified`) or is the metadata address. `localhost` and unresolvable hosts are violations. Called from `_prepare_config_for_storage` and from `_fetch_records`.
- **Redirects are not followed** (httpx default) — so a public host cannot bounce the server into a private range. Stated in the spec instead of adding redirect validation code.
- **Response cap = 5 MB streamed**, `VR_MAX_RESPONSE_BYTES`; the HTTP/JSON branch streams and stops at the cap with a FAIL message. Airtable pages are provider-bounded; Postgres is bounded by `LIMIT 100`.
- **Rate limiting is an in-memory sliding window per process** (`_RateLimiter`), keyed by client IP (first `X-Forwarded-For` hop when present) for `/auth/*`, by secret for `/hook/*`, by user id for `POST /checks`. Limits via env with generous defaults (`VR_RATE_AUTH_PER_MIN=120`, `VR_RATE_HOOK_PER_MIN=120`, `VR_RATE_CREATE_PER_MIN=60`); 429 with `Retry-After`. Alternative: slowapi/Redis — more machinery than one process needs.
- **Tests run a second server.** The pure policy is unit-tested; the enforcement is tested against a throw-away uvicorn on :8001 started by the test module with `VR_ALLOW_PRIVATE_EGRESS=0` and tiny rate limits, while the :8000 dev server keeps private egress on for the Postgres and catcher tests.

## Risks / Trade-offs

- [DNS rebinding between the save-time check and the fetch] → the fetch-time check narrows but does not close it; documented.
- [Rate limits reset on restart and are per process] → acceptable at this scale; noted in self-hosting.
- [Legit self-hosters watching `10.x` databases hit the wall] → the switch exists and the 400 names it.
