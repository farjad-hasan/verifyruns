## Why

Any signed-up user can make the server GET any URL or open a Postgres connection to any host, and there is no rate limiting on sign-up, login, or the webhook. On a contest demo this is tolerable; on a public free tier it is an SSRF vector into the hosting network (cloud metadata, internal services) and an abuse surface. The security page that agencies will ask for cannot be written until this is closed.

**Activation trigger:** before any public "free tier" announcement or the first non-invited sign-up wave; mandatory before leaving Emergent for a host with private-network reachability.

## What Changes

- Resolve destination hostnames and refuse private, loopback, link-local, and metadata ranges (IPv4 and IPv6) for HTTP/JSON and Postgres DSNs; refuse redirects to such ranges.
- Cap response size (default 5 MB) and total fetch time per run.
- Rate limits: auth routes (per IP), webhook (per secret), check creation (per user). Simple in-memory token bucket now; Redis later.
- Password policy unchanged; add optional email verification flag for later.
- Security page content: what is fetched, from where, what is stored (pairs with `data-minimisation`).

## Capabilities

### New Capabilities
- `egress-policy`: allowed destinations, size/time caps, rate limits.

### Modified Capabilities
- `connectors`: "no egress restrictions" requirement is replaced.
- `auth`: "no abuse controls" requirement is replaced.

## Impact

`_fetch_records`, `_prepare_config_for_storage` (validate at save time too), new middleware; env `VR_ALLOW_PRIVATE_EGRESS` for self-hosted users who *want* to watch an internal database.
