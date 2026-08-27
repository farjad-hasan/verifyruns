## 1. Dependency hygiene

- [x] 1.1 `backend/requirements.txt` trimmed to what `server.py` and the tests import (removed boto3, requests-oauthlib, passlib, tzdata, black, isort, flake8, mypy, python-jose, pandas, numpy, python-multipart, jq, typer)
- [x] 1.2 Proven with a fresh venv: install from the trimmed file, `server` imports, full suite 72 passed

## 2. Documentation

- [x] 2.1 `README.md` replaces the Emergent placeholder: pitch, diff example, 3-step setup with curl, connector table, verdict rules, self-host instructions, OpenSpec pointer, status
- [x] 2.2 `docs/n8n.md`, `docs/make.md`, `docs/zapier.md` — per-platform setup; each says it is not yet validated against a live workflow
- [x] 2.3 `docs/self-hosting.md` (all env vars, process model, network caveat, backups), `docs/what-we-store.md` (honest current state), ~~`docs/security.md`~~ (removed 2026-08-27 on Farjad's call — deferred until `egress-lockdown` lands)
- [x] 2.4 UI snippet aligned with the n8n doc (`$input.all().length`)
- [x] 2.5 PRD date fixed and PRD points at OpenSpec (done 2026-08-26)

## 3. Verify locally, then push

- [x] 3.1 Production build compiles after the snippet change
- [x] 3.2 Commit; push
