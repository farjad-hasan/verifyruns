# VerifyRuns with Zapier

Add a **Webhooks by Zapier → POST** action as the last step of the Zap.

| Field | Value |
|---|---|
| URL | the Check's webhook URL |
| Payload Type | json |
| Data | `wrote` → `1` (a Zap runs once per triggering item, so one write per run is usually accurate) |
| Wrap Request In Array | no |

If the Zap uses a Looping step or writes several rows, send the loop's item count instead.

Leave Data empty to have VerifyRuns check growth against the Check's own minimum.

Zapier's own alerts tell you when a Zap *errors*; VerifyRuns tells you when a Zap *succeeds without landing anything*. Use both.

Not yet validated against a live Zap by the VerifyRuns authors — confirm the request in the Zap's history.
