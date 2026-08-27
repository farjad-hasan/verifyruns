## Context

Every run stores `fingerprint.newest_record` and (since `deterministic-newest-record`) `newest_window` — up to five full destination rows — unencrypted and forever, plus 500 chars of upstream response bodies in `error_details`. The verdict engine needs those rows only *at verdict time*; nothing reads them back except the run panel. The baseline comparison uses `record_count` and `fields` only.

## Goals / Non-Goals

**Goals:**
- Default runs store no destination row content — only counts, field names, null rates and a hash of the newest record.
- Raw samples become opt-in per Check and expire after 30 days, enforced by the database, not by a cron.
- Users can delete everything: account deletion removes user, Checks, runs and samples.
- `docs/what-we-store.md` becomes true as written.

**Non-Goals:**
- Encrypting stored samples (opt-in samples are short-lived instead).
- Retention controls on runs themselves (verdict history stays until the Check is deleted).
- Retroactive scrubbing of runs written before this change (documented; the panel simply shows what is there).

## Decisions

- **Samples live in their own collection, `run_samples`, with a TTL index on `expires_at`.** A Mongo TTL index deletes whole documents, so putting `expires_at` on the run would delete the verdict too. `run_samples` holds `{run_id, check_id, newest_record, newest_window, error_details, expires_at}`; `GET /api/runs/{id}` attaches it as `sample` when present. Alternative: a nightly scrub job — a second moving part that can silently stop.
- **The fingerprint always carries `newest_hash`** — SHA-256 of the canonical JSON (`sort_keys`, compact separators) of the newest record — so "unchanged since last run" stays detectable without the row. `sample_stored: bool` says whether a sample exists for this run.
- **`_fingerprint` is unchanged; redaction happens once, at write time,** via `_split_sample(fp, error_details, store_samples)` → `(stored_fp, sample_doc | None)`. The verdict engine keeps working on the full in-memory fingerprint.
- **`store_samples` is a Check field (default false),** on create and update, shown in the expectations editor with the retention stated in the label.
- **`error_details` follows the same switch:** the diff message already carries the HTTP status; the body goes into the sample only when samples are stored.
- **Account deletion is `DELETE /api/auth/me`**: deletes `run_samples`, `check_runs`, `checks`, then the user. No soft-delete.

## Risks / Trade-offs

- [Old runs still hold raw rows] → documented; `DELETE` the Check to purge, or an admin one-liner in self-hosting docs.
- [TTL deletion runs every 60 s on Mongo's schedule] → "about 30 days", stated as such.
- [Hash reveals nothing but equality] → intended; it is a fingerprint, not a lookup.
