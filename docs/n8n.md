# VerifyRuns with n8n

Add one **HTTP Request** node as the last step of the workflow you want verified.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | the Check's webhook URL (copy it from the Check page) |
| Send Body | on |
| Body Content Type | JSON |
| Body | `{ "wrote": {{ $input.all().length }} }` |

`$input.all().length` is the number of items that reached the node — normally the number of records the previous node wrote. If the node runs once per item, set **Execute Once** on it or move it after an aggregation step, otherwise it fires once per item.

Leave the body empty if you only want VerifyRuns to check growth against the Check's own minimum.

Don't want the node to wait for the destination read? Append `?wait=0` to the URL: VerifyRuns answers `202` immediately and runs the check within a minute.

## What the verdict means

- **PASS** — the destination gained at least what the workflow claimed (or the Check's minimum) and every field rule held.
- **FAIL** — the run said "done" but the destination disagrees. The message says exactly how: `your workflow said it wrote 3 records; the destination gained 0`.

## Making the n8n execution fail too

The webhook runs the check inside the request and answers with the verdict (`?wait=30` is still accepted for older setups but no longer needed):

```json
{"accepted": true, "run_id": "…", "verdict": "FAIL", "diff_message": "Run reported success, but …", "timed_out": false}
```

Put an **IF** node after the HTTP Request on `{{ $json.verdict === "FAIL" }}` and route it to a **Stop and Error** node with `{{ $json.diff_message }}` — the execution goes red with VerifyRuns' sentence. A slow destination means a slower reply, bounded by the connector timeouts.

The **VerifyRuns community node** (`n8n-nodes-verifyruns`, private repo for now) does all of this in one node: it sends the item count as `wrote`, waits for the verdict, and throws on FAIL.

## Note

The expression above follows n8n's documented `$input` API; it has not yet been exercised against a live n8n workflow by the VerifyRuns authors. If it misbehaves in your version, `{{ $items().length }}` is the older equivalent.
