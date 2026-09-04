# VerifyRuns with n8n

Before connecting the workflow, create a Check and record a baseline with **Run Check now**. The first count assertion is FAIL / Verification incomplete, without a setup alert. Send the next webhook only after the batch commits. Use one writer, a stable complete result set and sequential batches. The `wrote` count means **expected new records**, not updates or arbitrary input items. See the public [setup guide](https://verifyruns.pages.dev/setup) for scope and connector limits.

Add one **HTTP Request** node as the last step of the workflow you want verified.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | the Check's webhook URL (copy it from the Check page) |
| Send Body | on |
| Body Content Type | JSON |
| Body | `{ "wrote": {{ $input.all().length }} }` |

`$input.all().length` is the number of items that reached the node — use it only if each item represents one expected new destination record. If the node runs once per item, set **Execute Once** on it or move it after an aggregation step, otherwise it fires once per item.

Leave the body empty if you only want VerifyRuns to check growth against the Check's own minimum.

Don't want the node to wait for the destination read? Append `?wait=0` to the URL: VerifyRuns answers `202` immediately and queues the check for the periodic scheduler (normally the next tick, with no fixed latency guarantee).

## Telling VerifyRuns the workflow failed

Point your **Error Workflow** (Workflow settings → Error workflow) at the same webhook with the body `{ "failed": true, "error": "{{ $json.execution.error.message }}" }` (a JSON boolean, not the string `"true"`). That run is a FAIL with the sentence "Your workflow reported failure: …", is alerted straight away (no retry — re-reading the destination cannot change what the workflow said), and the next passing run recovers it. Without this, an n8n execution that dies before the last node is only caught by the heartbeat.

## What the verdict means

- **PASS** — the destination gained at least what the workflow claimed (or the Check's minimum) and the configured sampled-field rules held; a first read only establishes a baseline.
- **FAIL** — the run said "done" but the destination disagrees. The message says exactly how: `your workflow said it wrote 3 records; the destination gained 0`. Or the workflow said it failed: `Your workflow reported failure: step 4 timed out.`

## Making the n8n execution fail too

The webhook runs the check inside the request and answers with the verdict (`?wait=30` is still accepted for older setups but no longer needed):

```json
{"accepted": true, "run_id": "…", "verdict": "FAIL", "diff_message": "Run reported success, but …", "timed_out": false}
```

Put an **IF** node after the HTTP Request on `{{ $json.verdict === "FAIL" }}` and route it to a **Stop and Error** node with `{{ $json.diff_message }}` — the execution goes red with VerifyRuns' sentence. A slow destination means a slower reply, bounded by the connector timeouts.

The **VerifyRuns community node** ([`n8n-nodes-verifyruns` on npm](https://www.npmjs.com/package/n8n-nodes-verifyruns) — install it in n8n via Settings → Community Nodes; validated in n8n 2.35.7 from the CLI and through the editor, see below) does all of this in one node: it sends the item count as `wrote`, waits for the verdict, and throws on FAIL.

## Validated

Both paths on this page were exercised on 2026-08-28 against the live API with n8n **2.35.7** (`n8n execute` from the CLI, Manual Trigger → one node): the HTTP Request body above sent `{"wrote": 1}` for one item and the run came back FAIL with `your workflow said it wrote 1 records; the destination gained 0`; the community node, installed from its packed tarball into `~/.n8n/nodes`, turned the execution red with the same sentence and passed when *Report What Was Written* was off. Editor run 2026-08-29: the node shows in the picker, its parameters render, a default run turns the execution red with the FAIL sentence, and *Report What Was Written* off gives a green run. If `$input.all().length` misbehaves in an older version, `{{ $items().length }}` is the older equivalent.
