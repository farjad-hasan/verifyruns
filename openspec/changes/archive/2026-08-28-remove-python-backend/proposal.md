# remove-python-backend

## Why

Since 2026-08-28 the product runs on the Cloudflare Worker (`worker/`) and the Python API (`backend/`, FastAPI + MongoDB) has been a "fallback" nobody deploys: Render needs a card, the Atlas cluster is idle, and every fix since the port (claimed-count edge cases, Postgres TLS, egress) landed in the Worker only — so the fallback is already behind the contract it claims to share. Two implementations of one API is a standing invitation to drift and doubles the docs. Farjad's call, 2026-08-28: he will not self-host the Python build.

## What changes

- Delete `backend/`, `render.yaml`, `deploy/cloudflare-tick-worker/`, the Emergent scaffolding (`.emergent/`, `tests/`, `test_result.md`) and `test_reports/` (Emergent-era pytest output). `design_guidelines.json` stays — the frontend still follows it. Git history keeps them; the last commit carrying the Python API is tagged `python-backend-final`.
- `docs/self-hosting.md` describes the Worker build only; `docs/deploy.md` loses the Render + Atlas section; README dev instructions become `worker/` + `frontend/`; PRD and security page drop the fallback lines.
- Spec: the deployment requirement no longer promises a documented Render fallback, and `/api/internal/tick` stays as a manual endpoint only.

## Out of scope

Deleting the idle Atlas cluster (Farjad's dashboard, kept on his call).
