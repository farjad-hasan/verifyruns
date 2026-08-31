## Context

`api.js` has one response interceptor: any 401 outside `/`, `/login`, `/signup` clears `rp_token` and `window.location.replace("/login")`. `AuthProvider` mounts on every route and calls `/auth/me` whenever a token exists, so an expired token 401s on public pages too. Poll loops are raw `setInterval`s; react-query is installed and unused.

## Goals / Non-Goals

**Goals:**
- A user is never bounced off a page that does not require auth.
- Every failure state is a sentence on screen (product principle 1), including a render crash.
- Idle and broken states cost the Worker near-zero.

**Non-Goals:**
- Migrating data fetching to react-query — bigger refactor; the `usePoll` hook centralises the policy now and is react-query-shaped for later. (Alternatively drop the dependency; decided at implementation.)
- Refresh tokens / silent renewal — 7-day sessions stay; only the exit gets honest.

## Decisions

- **Redirect on route intent, not path allowlist.** The interceptor redirects only when the failing request's route is protected: mark protected surfaces via a request flag (axios config `meta.protected`, set by the authed data hooks) or, minimally, redirect only when `err.config.url === "/auth/me"` *and* the current route is under `Protected`. An allowlist of public paths is the bug we are removing — new public routes would silently regress.
- **Return-to + reason.** Redirect to `/login?expired=1&next=<path>`; `AuthPage` renders the sentence and honours `next` after login (same-origin paths only).
- **One error boundary at the router root**, plus one around the run-detail sheet (the JSON-heavy surface), so a bad fingerprint payload degrades to a broken card inside a working page.
- **`usePoll(fn, {interval, hiddenPause: true, backoff})`** — single implementation of visibility pause, error backoff, and unmount cleanup; all four poll sites move onto it. Manual-run polling keys off run status from the response, not a fixed 4 s timer.
- **Titles via a `useTitle(title)` hook** — no Helmet dependency for six strings.

## Risks / Trade-offs

- [Hidden-tab pause delays the dashboard's picture by up to one interval on refocus] → refetch immediately on `visibilitychange` to visible.
- [`next` parameter open-redirect] → allow only paths starting with `/`, reject `//` and URLs.
