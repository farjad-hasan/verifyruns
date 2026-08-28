## 1. Remove
- [x] 1.1 Tag `python-backend-final`; `git rm -r backend render.yaml deploy .emergent test_reports`
- [x] 1.2 Worker suite green (78 passed, 5 Postgres tests skipped without Docker pg); frontend untouched

## 2. Docs
- [x] 2.1 `docs/self-hosting.md` = Worker + D1 only (wrangler, secrets, vars, backups via D1 export)
- [x] 2.2 `docs/deploy.md` without the Render/Atlas fallback; README dev + tests sections; `memory/PRD.md`; `docs/security.md` gap list
