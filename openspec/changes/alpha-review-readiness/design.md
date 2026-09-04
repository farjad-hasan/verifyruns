## Context

The current Cloudflare Worker/D1 and React app is deployed. OPG will review the alpha next week. The existing PASS/FAIL integrations must remain compatible, but false assurance must stop. Remote changes through 21d5f2f are the baseline.

## Goals / Non-Goals

**Goals:** accurate assertions, honest public copy, teachable setup, tested alerts and recovery, repeatable review evidence.

**Non-Goals:** record-ID reconciliation, billing, agency management, analytics or a redesign.

## Decisions

1. Keep two verdicts. An unavailable configured assertion fails with an explicit explanation instead of adding a third enum that existing n8n nodes would treat as success. First positive-growth/steady evaluation records a baseline and fails as incomplete without alerting for that setup state; the next observation can evaluate growth. Zero-growth checks can pass an initial read with bounded wording.
2. Separate field history (30 PASS samples) from count history (preceding readable destination observation, including a FAIL). Store read success and the original count baseline in the existing fingerprint JSON; only observations bound to the current destination configuration participate; historical unbound rows start fresh. Retry the original observation interval, not a new interval beginning at the failed read. Cancel obsolete pending retries when a newer real run lands.
3. Claimed counts are minimum net growth, not exact equality or proof of identity. Optional growth reports that additions were not required. Non-empty rules fail when the field is absent or no rows can be inspected; inability to order configured newest rules fails clearly.
4. Make setup explicit: default minimum one; explain baseline then real workflow run; support email alongside webhooks; expose a channel test action that reports delivery without changing incident state. Publish /setup with supported use cases and limits.
5. Use existing tokens and components. Rewrite landing/pricing/docs with one bounded promise and no competitor absolutes, unavailable agency features, unmeasured setup guarantees, or fabricated incidents. Keep prospective pricing separate from available early-access features.

## Risks / Trade-offs

- Newly incomplete assertions can alert existing users → document the behavior and preserve zero-growth dogfood checks.
- Aggregate counts cannot attribute concurrent writers, updates, deletes, pagination windows or duplicates → explicitly scope the alpha to stable, complete, append-only views with sequential runs; do not claim per-record reconciliation.
- Historical fingerprints do not distinguish read errors → start a new baseline after upgrade; explain this to existing operators.
- Alert provider acceptance is not inbox receipt → report acceptance accurately and require manual receipt confirmation in the release checklist.
- Hosted credentials may be unavailable → complete local and staging verification where possible and record any remaining deployment/real-provider evidence precisely.

## Migration Plan

No schema migration: additive fingerprint JSON and pending-retry metadata. Validate OpenSpec, worker tests/typecheck and frontend build; exercise local browser and API smoke, then existing staging-to-production pipeline. Rollback code preserves readable JSON and the prior verdict enum. New verdict wording is intentionally changed.
