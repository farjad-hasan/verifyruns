# Alpha release evidence — 2026-09-05

Change: alpha-review-readiness. Base: 21d5f2f. Main release: 715ddc6 (PR #15), with deployed-routing follow-up 8c04a9f.

## Verified locally

- Worker: 220 tests passed in the final local suite after the routing flag change; five Postgres integration tests skipped because no local Postgres instance exists. Tests cover real D1/workerd execution plus mocked external APIs, including Airtable paging/newest-five completeness, count baseline isolation, retry intervals, reported failures, credential protection, owner isolation and provider acceptance/error responses.
- Worker TypeScript check passed.
- Frontend optimized build compiled successfully; the final local build also passed.
- Strict OpenSpec validation: 22 items passed, zero failed.
- scripts/alpha-smoke.mjs: all 12 checks passed against a local Wrangler API with actual HTTP fixture traffic: signup/login, independent alert test, baseline/no-op/growth, failure streak suppression, recovery, public sharing/redaction/revocation, snooze/reported failure, destination editing, manual/queued execution, pricing interest and deletion.
- Browser: pricing intent survived signup; new Check defaulted to minimum 1; channel test succeeded; manual baseline appeared; destination edit retained an omitted URL and saved a newest key; actual webhook PASS then FAIL appeared in the timeline; the run sheet displayed the full verdict, provider result and previous count baseline.

## Deployed routing issue found during rehearsal

The first deployed synthetic channel test failed with Cloudflare error 1042 when production fetched a staging Worker in the same zone. Both test accounts were deleted. Cloudflare documents global_fetch_strictly_public as the compatibility flag for public Worker-to-Worker requests: [Fetch documentation](https://developers.cloudflare.com/workers/runtime-apis/fetch/). The release follow-up enables it for staging and production; the application’s existing egress validation still applies. After deploying the flag, the same live rehearsal passed all 13 checks.

## Verified on the deployed service

scripts/alpha-live-smoke.mjs passed **13 checks** on 2026-09-05 after the routing fix:

- Staging and production signup/login.
- Production Send test reached an actual HTTP receiver implemented by a separate disposable staging Check, without recording a verdict on the tested Check.
- Empty destination baseline returned incomplete without a setup alert.
- Three real staging writes produced a production growth PASS; claiming three without writing produced FAIL and one notification; a repeated FAIL did not send another.
- Three more writes produced PASS and a recovery notification.
- Anonymous public status omitted destination details and secrets; revocation returned 404.
- A configured missing field failed on the deployed engine; pricing interest recorded without payment.
- Both scheduler health endpoints passed. Both disposable accounts were deleted and their sessions rejected afterwards.

The controlled destination was a staging status feed kept below its 30-run cap. This is synthetic workflow evidence with real network traffic and storage, not customer or inbox evidence. The source Check read the public JSONPlaceholder sample API. No existing user's workflow was modified.

Published browser checks confirmed /setup and /pricing, with the new scope, baseline instructions, accurate proposed packages and loaded production pricing data. Local browser checks covered the authenticated forms and run detail sheet.

## Release gates and external evidence

CI and deployment gates now require a real Postgres 16 service on :5434; the five integration cases must run before merge/deployment. Final branch c7bc334 passed all **225 tests**, including the five Postgres cases, plus typecheck and frontend build: [CI run](https://github.com/farjad-hasan/verifyruns/actions/runs/33928476976). The final deployment at 8c04a9f passed all gates, including the Postgres-backed test suite, staging migration/deploy/health, production migration/deploy/health and Pages build/deploy: [successful deployment](https://github.com/farjad-hasan/verifyruns/actions/runs/33929145401).

Actual Slack/Discord/email inbox receipt and a real Airtable account have not been exercised for this release. Provider payloads, failures and destination pagination are tested; they are different evidence from receipt in an operator's chosen channel. Confirm Send test and the failure/recovery rehearsal for the actual pilot connection before relying on it.

Make and Zapier recipes remain unverified inside those vendors' editors. The generic HTTP contract is tested. n8n's previous editor/CLI validation is documented in docs/n8n.md and is historical evidence, not a new platform run for this release.

## Behavior change for existing Checks

The first count assertion without an observation bound to the current connection settings establishes a fresh baseline. It shows FAIL / Verification incomplete but does not alert for that setup state alone. Existing counts are not assumed to be newly written records. A malformed claim, capped/estimated count used for growth, or unavailable configured newest sample cannot return PASS. A minimum of zero explicitly disables growth unless a claim is sent. Counts now compare the preceding readable observation, including a failed batch; retries reuse the original interval.

## Operational scope

This is a reviewable alpha for stable, complete, sequential, append-only result sets with one writer. It does not prove record identity, arbitrary values, duplicate absence or update success. Read access and a suitable connection remain prerequisites, not product features that can be demonstrated without an external system.

No schema migration is introduced. Existing deployment applies outstanding migrations before staging and production code. Code rollback can use the prior worker/frontend commit; additive fingerprint/retry JSON remains readable, but rolling back restores the old verdict limitations.

## Repeat the deployed rehearsal

Run `node scripts/alpha-live-smoke.mjs` from the repository root. It creates disposable accounts on the hard-coded staging and production APIs and deletes both in a finally block. It checks HTTP notification acceptance using a synthetic receiver; it does not send to a real chat channel or inbox. Use the OPG rehearsal in [alpha-review.md](alpha-review.md) for actual pilot-specific receipt confirmation.
