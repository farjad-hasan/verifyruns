## Why

The 08-23 GTM scan identified the fastest distribution channel as an MIT, verified n8n community node ("Verify Destination") plus a free workflow template — n8n's nodes panel reaches every Cloud and self-hosted user, and the paid layer is the hosted baseline store and dashboard VerifyRuns already is. Agency partnerships and content alone are slower.

**Activation trigger:** ≥10 external users with a live Check, or the contest advancing to judging. Without traction, the node is the OSS artifact for the brand engine and can ship without the hosted tier.

## What Changes

- New repo `verifyruns-n8n` (separate; verification rules require MIT, dependency-free, one service per package, GitHub-Actions provenance).
- Node "VerifyRuns: Verify Destination": inputs = VerifyRuns webhook URL + optional item count from the previous node; posts `{"wrote": N}`; optionally waits for the verdict and **throws** on FAIL so the n8n execution turns red.
- Backend: `GET /api/runs/{run_id}` polling is already available; add `?wait=30` long-poll on the webhook response for the node.
- Free template in the n8n library: "Airtable sync with destination verification".

## Capabilities

### New Capabilities
- `webhook-wait`: synchronous verdict on the webhook for integrators.

### Modified Capabilities
- `checks`: webhook may block up to `wait` seconds and return the verdict.

## Impact

Separate repo + npm package; small backend addition; docs page per platform (n8n node, Make HTTP module, Zapier Webhooks by Zapier).
