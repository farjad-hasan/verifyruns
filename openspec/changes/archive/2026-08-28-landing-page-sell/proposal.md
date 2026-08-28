## Why

The landing page shows a timeline strip as the hero — which looks like every uptime tool — while the product's actual magic, the plain-English diff message, is never shown. It also lacks the things a buyer looks for before signing up: who it is for, what it costs, what it stores, and copy-paste setup for their platform.

**Activation trigger:** the hero-diff and per-platform snippets are cheap and help the contest (UI/UX 15%, Problem Solving 20%) — do inside the window if credits allow. Pricing/security pages wait for `pricing-tiers` and `data-minimisation`.

## What Changes

- Hero: a rendered FAIL card with the real diff message ("Run reported success, but the destination gained 0 records…") beside the timeline.
- "Who this is for": automation agencies at client #21; solo operators running revenue-touching syncs.
- "Set up in your tool": three tabs — n8n HTTP Request node, Make HTTP module, Zapier Webhooks by Zapier — with the body snippet from `claimed-count-reconciliation`.
- Receipts section: the 2026-08-14 first-person incident (job exited 0, recorded nothing).
- 20-second GIF of a forced FAIL; footer links to Pricing and Security pages (stubs until their changes land).

## Capabilities

### New Capabilities
- `marketing-site`: landing, pricing, security pages and their required content.

### Modified Capabilities
- (none)

## Impact

`frontend/src/pages/Landing.jsx`, new `Pricing.jsx`, `Security.jsx`, routes; contest entry description mirrors the new copy.
