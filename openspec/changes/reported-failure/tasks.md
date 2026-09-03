## 1. Tests first (worker/test/)

- [x] 1.1 `engine.test.ts`: `parseReported` — `{status:"failed"}` → failed, null error; with `error` → trimmed to 500; `status:"ok"`/absent/non-string → not failed; non-object body → not failed
- [x] 1.2 `runs.test.ts`: reported failure with a healthy destination → FAIL, sentence with and without reason, `reported_failure`/`reported_error` on the run read, fingerprint stored, next PASS's baseline excludes it, heartbeat re-anchored; `?wait=0` path carries it through the tick
- [x] 1.3 `alerts.test.ts`: reported failure on a retry-before-alert Check → alert sent on the first run, `pending_retry` null; following PASS → Recovered
- [x] 1.4 migration 0006 applies over 0001–0005 in the harness

## 2. Worker

- [x] 2.1 `migrations/0006_reported_failure.sql`: `check_runs.reported_failure INTEGER NOT NULL DEFAULT 0`, `check_runs.reported_error TEXT`
- [x] 2.2 `engine.ts`: `parseReported(body): {failed: boolean; error: string | null}`
- [x] 2.3 `execute.ts`: new `reported` parameter; after the destination read, force FAIL + sentence when reported; insert the two columns; skip the retry branch for reported failures
- [x] 2.4 `routes.ts`: webhook parses and passes it (inline and queued); run reads expose the fields. `tick.ts` + `checks.ts`: `pending_runs` items carry `reported_failure`/`reported_error`

## 3. Docs

- [x] 3.1 `README.md` step 2 gains the failure body; `docs/n8n.md` error-workflow recipe; `docs/make.md`, `docs/zapier.md` one line each; `docs/what-we-store.md` lists the error string
- [x] 3.2 `docs/dogfood.md` and `docs/unreachable-destination.md`: replace the known-limit paragraphs with the feature

## 4. Wrapper (farjad-world)

- [ ] 4.1 `scripts/test_report_run.py`: non-zero exit → body `{"wrote": w, "status": "failed", "error": "exit N"}`; zero exit → `{"wrote": w}` unchanged
- [ ] 4.2 `scripts/report_run.py`: implement; `brand_state` tests still green

## 5. Verify locally, then push

- [x] 5.1 `cd worker && npm test && npm run typecheck` green; `cd frontend && CI=true yarn build` clean (no frontend change expected)
- [ ] 5.2 Blind review of the diff before merge
- [ ] 5.3 Merge to `main` (migration before code, as the pipeline does); live: run the wrapper with `/usr/bin/false` on `kb-reindex` → FAIL "Your workflow reported failure: exit 1." + Discord alert; then `/usr/bin/true` → PASS + Recovered; flip the claim; remove the worktree
