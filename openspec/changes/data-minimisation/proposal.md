## Why

Every run stores a full destination row (`fingerprint.newest_record`) unencrypted in MongoDB, forever, plus 500 characters of upstream response bodies in `error_details`. For an orders or CRM table that is names, emails and amounts. Agencies will ask "what do you store?" and today the honest answer loses the deal. The product needs the fingerprint, not the data.

**Activation trigger:** first agency conversation, or before publishing a security page — whichever is first.

## What Changes

- Default storage per run: field names, null rates, record count, sample size, and a SHA-256 of the canonicalised newest record (enough to detect "unchanged").
- Raw sample storage becomes opt-in per Check (`store_samples: true`) with a 30-day TTL index; UI explains the trade-off.
- `error_details` redacted to status line + content-type by default; full body opt-in.
- Delete-my-data: deleting a Check already deletes runs; add account deletion.
- One-paragraph "What we store" page generated from this spec.

## Capabilities

### New Capabilities
- `data-retention`: what is stored per run, TTLs, opt-ins, deletion.

### Modified Capabilities
- `verdict-engine`: fingerprint stores a hash by default; non-empty rule uses the sample at run time only.
- `public-status`: unchanged surface, but confirms no sample data leaks.

## Impact

`_fingerprint`, run doc shape, Mongo TTL index, CheckDetail run panel (hide sample when absent), landing/security copy.
