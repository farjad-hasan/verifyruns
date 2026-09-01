# app-shell Specification

## Purpose
The frontend's shared shell behaviour: how the SPA treats expired sessions on protected vs public routes, contains render errors with an error boundary, serves a real 404, titles each route, and paces its polling with tab visibility and API health. As built in `frontend/src/lib/api.js`, `lib/auth.jsx`, `App.js` and the page-level `usePoll` hook by the `app-resilience` change (2026-09-01).
## Requirements
### Requirement: Expired sessions never hijack public routes
A 401 response SHALL cause a redirect to `/login` only when it arose from a protected surface. Public routes — `/status/:token`, `/reset`, `/forgot`, `/pricing`, `/data`, `/security`, `/terms`, `/privacy`, and the landing page — SHALL render fully with an expired or absent token. The redirect SHALL carry `?expired=1` and a same-origin `next` path; `/login` SHALL show "Signed out — your session expired." and return the user to `next` after login.

#### Scenario: Reset link with an expired session
- **WHEN** a user holding a 7-day-old token opens `/reset?token=abc`
- **THEN** the reset form renders with the token intact and no redirect occurs

#### Scenario: Public status on a wall display
- **WHEN** a signed-out or expired browser shows `/status/:token`
- **THEN** the page keeps rendering verdicts indefinitely

#### Scenario: Session expires on the dashboard
- **WHEN** `/auth/me` answers 401 while the user is on `/dashboard`
- **THEN** they land on `/login?expired=1&next=/dashboard`, see the expiry sentence, and return to the dashboard after logging in

### Requirement: Render failures degrade to a sentence, not a blank page
A router-level error boundary SHALL catch any render throw and show a readable failure card with a reload action; the run-detail sheet SHALL have its own boundary so one malformed run payload breaks only that sheet.

#### Scenario: Malformed fingerprint
- **WHEN** a run's stored fingerprint fails to render in the sheet
- **THEN** the sheet shows a failure card and the rest of the check page keeps working

### Requirement: Unknown routes get a 404 page
A path matching no route SHALL render a 404 page naming the path with links to the dashboard and landing page — never a silent redirect.

#### Scenario: Typo in a check URL
- **WHEN** a logged-in user opens `/chekcs/abc`
- **THEN** they see the 404 page, not the landing page or dashboard

### Requirement: Every route has its own title
`document.title` SHALL identify the route: the check name on detail and public status pages, the page name elsewhere, suffixed "— VerifyRuns".

#### Scenario: Three check tabs
- **WHEN** three different checks are open in tabs
- **THEN** each tab shows its check's name

### Requirement: Polling is lifecycle-aware
All poll loops SHALL pause while the document is hidden and refetch immediately on return to visibility, back off on consecutive errors (10 s → 30 s → 60 s cap, reset on success), and be cleaned up on unmount. The manual-run fast poll SHALL stop when the run reaches a terminal state, not on a fixed timer; public status pages SHALL poll at 30 s.

#### Scenario: Backgrounded dashboard
- **WHEN** the dashboard tab is hidden for an hour
- **THEN** no requests are made until it becomes visible, then one immediate refresh occurs

#### Scenario: API down
- **WHEN** polls fail repeatedly
- **THEN** the interval decays to the 60 s cap and recovers to normal on the first success

