## 1. Interceptor + session

- [x] 1.1 `api.js`: scope the 401 redirect (protected-surface flag or `/auth/me`-under-`Protected` rule); append `?expired=1&next=`; sanitise `next` (leading `/`, not `//`)
- [x] 1.2 `auth.jsx`: `/auth/me` failure on a public route resolves `user=false` without navigation
- [x] 1.3 `AuthPage.jsx`: expiry sentence when `expired=1`; navigate to `next` after login/signup

## 2. Containment + chrome

- [x] 2.1 `ErrorBoundary` at the router root and around the run sheet; failure card copy is a sentence with a reload button; `data-testid`s
- [x] 2.2 `NotFound` page + `App.js` route order (`path="*"` renders it; keep `PublicOnly` semantics)
- [x] 2.3 `useTitle` hook wired on every page; check detail and public status use the check name

## 3. Polling

- [x] 3.1 `usePoll` hook: visibility pause + immediate-on-visible, error backoff with cap and reset, unmount cleanup
- [x] 3.2 Move Dashboard (10 s), CheckDetail (10 s), PublicStatus (30 s) onto it; manual-run fast poll keys off terminal run status and clears its timer on unmount
- [x] 3.3 Decide react-query: adopt for these four sites or remove the dependency — no half-state

## 4. Verify locally, then push

- [ ] 4.1 Manual matrix in Edge with a deliberately expired token: `/reset?token=x`, `/status/<token>`, `/pricing` all render; `/dashboard` → login with sentence → returns to dashboard
- [ ] 4.2 Throttle DevTools offline: dashboard backs off to 60 s and shows its existing retry copy; hidden tab makes zero requests (Network panel)
- [ ] 4.3 Production build compiles; `frontend` has no new console errors; commit; push; update `memory/PRD.md`
