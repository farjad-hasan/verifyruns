## Context

Nobody has paid for VerifyRuns yet, and the 08-23 scan's central caveat was "no proven payer". Farjad's decision 2026-08-27: the product stays free during early access; publish the tiers now and wire billing later. Paddle (merchant of record, no monthly fee, ~5% + $0.50 per transaction, Pakistan-approved via Payoneer) is the intended processor when that day comes.

## Goals / Non-Goals

**Goals (this iteration — the cheap version):**
- A public `/pricing` page listing Free / Pro / Agency with *planned* prices and what each includes, under a clear "early access — everything free, no card" banner.
- Capture willingness to pay: an authenticated "I'd pay for Pro/Agency" click records `{plan, email, note}` in an `interest` collection. That list decides which tier opens first and is the evidence Paddle's review will ask for.
- Prices are the proposal's hypothesis ($19–29 / $79–99) and are labelled "planned".

**Non-Goals (next iteration — `billing-paddle`, opened when the interest list justifies it):**
- Server-side plan limits (402s), a `plan` field on users, Paddle checkout + webhook, customer portal.

## Decisions

- **`GET /api/plans` is the single source for the tiers** (server-side constant, `early_access` flag from `VR_EARLY_ACCESS`), so the page and any future limit enforcement read the same definition.
- **Interest requires login** — an email we can actually reach beats an anonymous click, and it keeps the endpoint off the abuse surface.
- **No card, no Paddle SDK yet.** The moment someone clicks, we know; adding checkout to a page that nobody has clicked would be building ahead of evidence.

## Risks / Trade-offs

- [Planned prices anchor expectations] → labelled "planned" and the page invites pushback before lock-in.
- [Interest ≠ payment] → understood; it is the cheapest next signal, not the last one.
