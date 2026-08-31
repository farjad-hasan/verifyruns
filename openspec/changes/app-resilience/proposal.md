## Why

The frontend silently ejects the users who most need it. The axios 401 interceptor hard-redirects to `/login` from every route except three — including `/reset?token=…` (destroying the one-hour reset link for exactly the user whose session lapsed), `/status/:token` (a public page needing no auth), and every marketing page. Sessions expire after 7 days with no message. There is no error boundary, so one malformed API payload white-screens the app. There is no 404 (typos teleport to the landing page), every route shares one 60-character marketing `<title>`, and polling never pauses on hidden tabs or backs off when the API is down — every open tab hammers a dead backend every 10 s, and a wall-mounted public status page is a permanent anonymous load.

Production-readiness review 2026-08-31: frontend C1–C3, H6, M2, M3.

## What Changes

- 401 handling is scoped to requests from protected surfaces (or `/auth/me` specifically); public and auth-flow routes never redirect. Expiry redirects carry `?expired=1` and a return-to path; `/login` says "Signed out — your session expired."
- A top-level React error boundary renders a readable failure card with a reload action instead of a blank root.
- A real 404 route; per-route `document.title` ("<check name> — VerifyRuns", "Dashboard — VerifyRuns", check name on public status).
- Polling pauses when `document.hidden`, resumes on visibility, and backs off (10s → 30s → 60s cap) on consecutive errors; the 1.5 s manual-run poll stops at terminal state instead of a 4 s timer; public status pages poll at 30 s.

## Capabilities

### New Capabilities
- `app-shell`: session lifecycle, failure containment, navigation chrome, and polling policy for the SPA.

## Impact

`frontend/src/lib/api.js`, `frontend/src/lib/auth.jsx`, `frontend/src/App.js` (+ ErrorBoundary, NotFound), `frontend/src/pages/AuthPage.jsx`, `Dashboard.jsx`, `CheckDetail.jsx`, `PublicStatus.jsx`, a small `usePoll` hook; `data-testid`s for the new states.
