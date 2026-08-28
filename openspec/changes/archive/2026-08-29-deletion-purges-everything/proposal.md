## Why

`docs/what-we-store.md` promises that **Delete account** removes "samples, runs, Checks and the user record immediately", but `DELETE /api/auth/me` leaves the `interest` rows (user id + email + note) behind. The same doc still says secrets are "Fernet-encrypted"; the Workers build uses AES-256-GCM. A data-minimisation pitch with a deletion promise the code does not keep is worse than no promise. Found in the 2026-08-29 production-readiness review.

## What Changes

- Account deletion also deletes `interest` rows and any password-reset tokens for the user.
- `docs/what-we-store.md` names the real cipher and lists everything deletion removes.

## Capabilities

### Modified Capabilities
- `data-retention`: account deletion is complete.

## Impact

`worker/src/routes.ts` (`deleteMe`), `docs/what-we-store.md`, `frontend/src/pages/DataPage.jsx` if it repeats the wording.
