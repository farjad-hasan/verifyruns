# VerifyRuns with Zapier

Before connecting the workflow, create a Check and record a baseline with **Run Check now**. The first count assertion is FAIL / Verification incomplete, without a setup alert. Send the next webhook only after the batch commits. Use one writer, a stable complete result set and sequential batches. The `wrote` count means **expected new records**, not updates or arbitrary input items. See the public [setup guide](https://verifyruns.pages.dev/setup) for scope and connector limits.

Add a **Webhooks by Zapier → POST** action as the last step of the Zap.

| Field | Value |
|---|---|
| URL | the Check's webhook URL |
| Payload Type | json |
| Data | `wrote` → `1` (only if the step should insert one new destination record) |
| Wrap Request In Array | no |

If the Zap uses a Looping step or writes several rows, aggregate the completed batch and send its expected insert count once.

Leave Data empty to have VerifyRuns check growth against the Check's own minimum.

Zapier's own alerts tell you when a Zap *errors*; VerifyRuns tells you when a Zap *succeeds without landing anything*. Use both — or route the error path to the same webhook with `failed` → `true` (a boolean, not text) and `error` → the message, so one status page carries both facts.

Not yet validated against a live Zap by the VerifyRuns authors — confirm the request in the Zap's history.
