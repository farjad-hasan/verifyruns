# Verifying a job whose destination VerifyRuns cannot read

**What this proves, and what it does not.** A Check built this way proves that your job
reached its end and said so — every run, on schedule — and it FAILs when a run never
arrives. It does **not** prove that your real destination changed. If the job writes to
a laptop, a NAS, a database behind a VPN, or a file on disk, that is the honest ceiling:
VerifyRuns verifies what it can read back, and here what it reads back is a run table
you keep for the purpose.

Use this when the connectors ([HTTP/JSON, Airtable, Postgres](../README.md#connectors))
cannot reach where your job writes. If they can, point a Check at the real destination
instead — the diff message is worth far more than a heartbeat.

## The pattern

1. Your job appends **one row per run** to a small table on the public internet.
2. It POSTs `{"wrote": 1}` to the Check's webhook.
3. The Check reads the table, expects one new row, and heartbeats when nothing arrives.

```
job finishes ─► INSERT row {job, exit, at} ─► POST {"wrote": 1} ─► VerifyRuns reads the table
                                                                   PASS: row arrived
                                                                   FAIL: no row / no run in N h
```

## The table

Any HTTP-readable store works. Supabase is the quickest free one; the shape is:

```sql
create table public.job_runs (
  id bigserial primary key,
  job text not null,           -- a label; keep it neutral, it can end up on a status page
  exit integer not null,       -- the job's exit code, for humans reading the row
  at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index job_runs_job_at on public.job_runs (job, at desc);

alter table public.job_runs enable row level security;
create policy job_runs_read on public.job_runs for select to anon using (true);
create policy job_runs_insert on public.job_runs for insert to anon
  with check (job = any (array['nightly-export','hourly-sync']) and length(note) <= 500);
```

The insert allowlist is the whole security model: the publishable key is public, so the
policy is what stops a stranger writing rows under your labels. Add a label to the array
when you add a job.

## The Check

- Connector **HTTP / JSON**, URL
  `https://<project>.supabase.co/rest/v1/job_runs?job=eq.<label>&select=id,job,exit,at,note&order=at.desc&apikey=<publishable-key>`
- Growth mode **Claimed**, minimum new records **1**, required fields `job, exit, at`
- **Heartbeat**: a little longer than the job's longest normal gap — a daily job wants 26–30 h,
  a weekly one about 170 h. The heartbeat is the part that catches the job that never started;
  the row is the part that catches the job that started and died before the end.

## The wrapper

The job needs two HTTP calls after it finishes. In any shell:

```bash
your-command; code=$?
curl -s -X POST "https://<project>.supabase.co/rest/v1/job_runs" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <publishable-key>" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"job\":\"nightly-export\",\"exit\":$code,\"at\":\"$(date -u +%FT%TZ)\"}" \
  && wrote=1 || wrote=0
if [ "$code" -eq 0 ]; then body="{\"wrote\":$wrote}"; else body="{\"wrote\":$wrote,\"status\":\"failed\",\"error\":\"exit $code\"}"; fi
curl -s -X POST "https://<your-host>/api/hook/<secret>" \
  -H "Content-Type: application/json" -d "$body"
exit $code
```

Three rules that matter more than the language: return the job's own exit code unchanged;
never let a failed report fail the job; and if the row insert fails, still ping the webhook
with `{"wrote": 0}` — that is what makes VerifyRuns notice the row is missing instead of
treating the run as silent.

A ready-made Python version (stdlib only, `report_run.py --job <label> -- <command>`) and a
live example of the whole pattern are in [docs/dogfood.md](dogfood.md).

## What a failed command looks like

The `status: failed` body above makes a non-zero exit a FAIL in its own right — "Your workflow
reported failure: exit 1." — alerted immediately and recovered by the next clean run. Without
it, a job that fails but still writes its row would PASS: the row proves the job reached its
end, not that it succeeded. Send the status; the exit code in the row is for humans.
