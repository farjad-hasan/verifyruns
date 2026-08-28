## ADDED Requirements

### Requirement: Account deletion leaves nothing behind
`DELETE /api/auth/me` SHALL delete, in one batch, the user's run samples, runs, Checks, pricing-interest rows and password-reset tokens, and then the user row; afterwards no table SHALL hold the user's id or email.

#### Scenario: User who registered interest deletes the account
- **WHEN** a user has posted to `/api/interest` and then calls `DELETE /api/auth/me`
- **THEN** the response is 200, the token stops working, and `interest` has no row with that user id or email
