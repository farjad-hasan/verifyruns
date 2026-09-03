# VerifyRuns with Make

Add an **HTTP → Make a request** module as the last module in the scenario.

| Field | Value |
|---|---|
| URL | the Check's webhook URL |
| Method | `POST` |
| Body type | Raw |
| Content type | JSON (application/json) |
| Request content | `{"wrote": 1}` — or the bundle count from an **Array aggregator** placed before it |

An error handler route (Break / Rollback / Ignore) can call the same webhook with `{"failed": true, "error": "<the error message>"}`; that run is a FAIL with the reason and is alerted without a retry.

A Make scenario runs once per trigger bundle, so the HTTP module fires once per bundle. If your scenario writes several records per run, put an Array aggregator in front of the HTTP module and use `{{length(…)}}` of its output as the count; otherwise `1` per bundle is usually right.

Leave the body empty (`{}`) to have VerifyRuns check growth against the Check's own minimum.

Not yet validated against a live Make scenario by the VerifyRuns authors — treat the field names as guidance and confirm the request in Make's execution log.
