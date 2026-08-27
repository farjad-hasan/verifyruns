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

## What the verdict means

- **PASS** — the destination gained at least what the workflow claimed (or the Check's minimum) and every field rule held.
- **FAIL** — the run said "done" but the destination disagrees. The message says exactly how: `your workflow said it wrote 3 records; the destination gained 0`.

## Making the n8n execution fail too

Not yet — the webhook returns immediately and the verdict arrives seconds later. A synchronous `?wait=` option and an n8n community node are tracked as `openspec/changes/n8n-community-node`.

## Note

The expression above follows n8n's documented `$input` API; it has not yet been exercised against a live n8n workflow by the VerifyRuns authors. If it misbehaves in your version, `{{ $items().length }}` is the older equivalent.
