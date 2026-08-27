## 1. Backend — webhook-wait (this repo)

- [x] 1.1 Tests: `?wait=20` returns `verdict`/`diff_message` and records exactly one run; `?wait=1` against a slow destination returns `verdict: null, timed_out: true` and the run still lands; no `wait` keeps the async contract; `wait` is capped at 60
- [x] 1.2 `webhook()` runs inline under `asyncio.shield` when `wait > 0`; no background task in that branch
- [x] 1.3 Docs: `docs/n8n.md` "Making the n8n execution fail too" updated; README mention

## 2. Node package — `farjad-hasan/verifyruns-n8n` (private)

- [x] 2.1 Create the private repo on GitHub (Farjad's explicit ask, 2026-08-27); repo-local git identity `farjad.developer@gmail.com`
- [x] 2.2 Package skeleton: `package.json` (MIT, zero runtime deps, `n8n.nodes` manifest), `tsconfig.json`, `LICENSE`, `.gitignore`, `README.md` stating "compiles + unit-tested; not yet validated in a live n8n"
- [x] 2.3 `nodes/VerifyRuns/request.ts` — pure `buildRequest({webhookUrl, wrote, waitSeconds}, itemCount)` and `verdictToError(response)`; `test/request.test.mjs` with `node --test`
- [x] 2.4 `nodes/VerifyRuns/VerifyRuns.node.ts` — parameters, `execute()`, throws `NodeOperationError` on FAIL when configured
- [x] 2.5 `npm run build` (tsc) clean; `npm test` green; `.github/workflows/publish.yml` present but disabled

## 3. Verify locally, then push

- [x] 3.1 verifyruns: full suite green (count pasted from pytest); commit; push
- [x] 3.2 verifyruns-n8n: first commit pushed to the private repo
