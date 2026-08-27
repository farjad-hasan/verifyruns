## ADDED Requirements

### Requirement: Plans are published
`GET /api/plans` SHALL return `early_access` and the list of plans (`free`, `pro`, `agency`), each with `name`, `planned_price`, `limits` and a one-line `for`. The `/pricing` page SHALL render exactly that list and, while `early_access` is true, SHALL say that every feature is free and no card is needed.

#### Scenario: Early access
- **WHEN** `VR_EARLY_ACCESS` is unset or `1`
- **THEN** `/api/plans` reports `early_access: true` and the pricing page shows the early-access banner

### Requirement: Interest is recorded per plan
`POST /api/interest {plan, note?}` (authenticated) SHALL store `{user_id, email, plan, note, created_at}` in the `interest` collection and return `{ok: true, plan}`; unknown plans are rejected with 422.

#### Scenario: Upgrade click
- **WHEN** a logged-in user clicks "I'd pay for Pro"
- **THEN** one interest record exists with their email and `plan: "pro"`, and no payment is requested

#### Scenario: Logged out
- **WHEN** a visitor clicks a paid tier's button without an account
- **THEN** they are taken to sign-up

### Requirement: Limits and billing are a later change
Server-side plan limits (HTTP 402 at the Free tier's Check count), the `plan` field on users, and Paddle checkout SHALL be delivered by a separate change (`billing-paddle`) opened when the interest list justifies it; until then every account has every feature.

#### Scenario: Free account today
- **WHEN** a free user creates a fourth Check during early access
- **THEN** it is created normally
