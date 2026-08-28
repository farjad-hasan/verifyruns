## 1. Tests first
- [x] 1.1 `describePgError` unit tests: no-SSL server, TLS handshake death (both driver phrasings), plain error with code
- [x] 1.2 End-to-end against Docker pg via `TEST_PG_DSN`: rows/fields/count, query error code, `sslmode=require` against a no-SSL server fails fast with the no-TLS message, connection refused fails fast

## 2. Implementation
- [x] 2.1 `npm run bundle:pg` → `src/vendor/pg.mjs` (+ `.d.ts`); remove `postgres` dependency
- [x] 2.2 Connector: `pg.Client`, single attempt, `VR_PG_CONNECT_TIMEOUT_MS`, TLS unless `sslmode=disable`, `describePgError`
- [x] 2.3 83 tests green (72 + 11 new); typecheck clean

## 3. Docs and deploy
- [x] 3.1 `docs/deploy.md` free-plan section, `docs/self-hosting.md` env table, `docs/security.md` posture line, README connector table note
- [x] 3.2 (2026-08-28, Worker version 2e200be1) Deploy; live proof: a Check against the Supabase pooler with `sslmode=disable` passes end-to-end from the edge, and the same DSN with TLS fails fast with the new message

## Result
Live from the edge against the Supabase pooler: TLS Check → FAIL "Postgres connection error: TLS handshake failed." in 1.6 s with the explanation; `sslmode=disable` Check → PASS (50 records, 3 fields) in 1.4 s, then +3 rows / `{"wrote":3}` → PASS matching, `{"wrote":5}` → FAIL. Test account, role and table deleted afterwards.
