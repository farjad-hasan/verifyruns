## Why

There is no price, so there is no way to learn whether anyone pays — and the 08-23 scan's central caveat is "no proven payer". Publishing tiers, even while everything is free, is the cheapest test of willingness to pay. Stripe is unavailable in Pakistan; Paddle (merchant of record, pays via Payoneer/wire) is the route.

**Activation trigger:** ≥10 external users with a live Check. Publish the page first; wire billing only when someone clicks "Upgrade".

## What Changes

- Tiers: Free — 3 Checks, Slack/Discord, 30-run history. Pro $19–29/mo — unlimited Checks, heartbeat, Postgres, 90-day history, email alerts. Agency $79–99/mo — client grouping, branded public status pages, priority alerts. Positioned under Administrate ($97–297) and Midwatch ($197–249), above NotiLens ($29–99).
- Plan field on users; limits enforced server-side (Check count, history window, connector kinds).
- Paddle checkout + webhook → plan updates; customer portal link.
- Pricing page (from `landing-page-sell`) shows real prices with "Upgrade" CTAs; before billing is wired, the CTA opens a "tell us what you'd pay for" form and logs the click.

## Capabilities

### New Capabilities
- `plans-and-billing`: plan model, limits, upgrade flow.

### Modified Capabilities
- `checks`: creation enforces plan limits; history window by plan.
- `alerts`: channel availability by plan.

## Impact

User model, middleware for limits, Paddle SDK/webhook route, env `PADDLE_*`, pricing page.
