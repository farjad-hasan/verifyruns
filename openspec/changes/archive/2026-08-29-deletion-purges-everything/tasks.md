## 1. Tests first
- [x] 1.1 API: register → `POST /api/interest` → `DELETE /api/auth/me` → `interest` holds no row for the user id or email (fails today)

## 2. Worker
- [x] 2.1 `deleteMe` batch also deletes from `interest` (and `password_resets` once that table exists)

## 3. Docs
- [x] 3.1 `docs/what-we-store.md`: AES-256-GCM, deletion list complete; `/data` page matches
- [x] 3.2 Suite green (count pasted), commit, archive
