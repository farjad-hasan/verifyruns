## Context

The fastest distribution channel identified for VerifyRuns is n8n's community-node panel. Today an n8n user wires an HTTP Request node by hand; a dedicated node makes it one drag, carries the item count automatically, and — with a synchronous verdict — can turn the n8n execution red when the destination disagrees, which is the moment the product earns its keep.

Decision 2026-08-27: the node lives in a **private** GitHub repo `farjad-hasan/verifyruns-n8n` for now (publish to npm and the n8n verification queue later, at Farjad's call).

## Goals / Non-Goals

**Goals:**
- `POST /api/hook/{secret}?wait=N` (≤ 60 s) returns the verdict in the same request; a timeout returns `verdict: null` and the run still lands.
- An n8n community node, `n8n-nodes-verifyruns`, MIT, **zero runtime dependencies** (verification rule), one node "VerifyRuns" with: webhook URL (password-typed), `wrote` (expression, default = incoming item count), wait seconds, "fail the execution on FAIL".
- The request-building logic is a pure function with `node --test` coverage; `tsc` is the build gate.

**Non-Goals:**
- Live validation inside a running n8n instance (not available here; stated in README and recap).
- Credentials type / OAuth; the webhook URL is the secret.
- Make/Zapier packages.

## Decisions

- **Inline execution under `asyncio.shield`.** `wait>0` runs `execute_check` as a task and waits up to `min(wait, 60)`; on timeout the task keeps running and the response says `timed_out: true`. No double-run: the background-task path is skipped when waiting.
- **Node = one `execute()` that calls `this.helpers.httpRequest`** with the body from `buildRequest(params, itemCount)`. When `wait > 0` and the verdict is FAIL and "fail on FAIL" is on, it throws `NodeOperationError` with the diff message — the execution goes red with VerifyRuns' sentence as the error.
- **Runs once per execution, not per item** (`executeOnce`-style: it reads `this.getInputData().length` and returns one item with the verdict), matching how the destination write it verifies also happened once.
- **Repo layout = n8n-nodes-starter minus the sample nodes**: `nodes/VerifyRuns/VerifyRuns.node.ts`, `nodes/VerifyRuns/request.ts` (pure), `test/request.test.mjs`, `package.json` with the `n8n.nodes` manifest, `tsconfig.json`, MIT `LICENSE`, README with the honest validation status.

## Risks / Trade-offs

- [n8n API drift between `n8n-workflow` versions] → pin `n8n-workflow` as a dev/peer dependency at a current 1.x; the node uses only `INodeType`, `IExecuteFunctions`, `NodeOperationError`.
- [Wait blocks an n8n worker for up to 60 s] → default 30 s, documented; the async path remains for users who don't need it.
- [Verification requires GitHub-Actions provenance] → a `publish.yml` workflow is included but disabled until the repo goes public.
