## Context

The landing page showed a green/red timeline strip as its hero — indistinguishable from any uptime tool — while the product's actual output, a plain-English verdict, appeared nowhere. It also lacked the things a buyer reads before signing up: who it is for, what it costs, what it stores, and how to wire it into their tool.

## Goals / Non-Goals

**Goals:** the diff sentence above the fold; a named audience; per-platform setup without leaving the page; a pricing page even while everything is free; a data page that matches `docs/what-we-store.md`.

**Non-Goals:** a demo GIF (deferred until a deployed URL exists), a security page (deferred on Farjad's call), analytics, SEO work.

## Decisions

- **The verdict card is the hero.** It is the product; the timeline is context underneath it. Copy is a real message the engine produces today.
- **Receipts in publishable form.** The 2026-08-14 incident is told as "one of my own scheduled jobs hit a lock, exited 0, and recorded nothing" — no scheduler, job or repository names (work-content rule: process yes, identifiers no).
- **Setup tabs are static text**, not a live generator: the webhook URL is per Check, so the page shows the shape and the Check page shows the real URL.
- **Pages, not modals**: `/pricing` and `/data` are public routes so they can be linked from anywhere.
- **Voice**: short sentences, no three-point frameworks in prose, opinionated ("Stop trusting the green checkmark"), specific names (Airtable, upsert, 200 OK).
