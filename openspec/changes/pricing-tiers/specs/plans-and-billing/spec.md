## ADDED Requirements

### Requirement: Plans gate limits server-side
Users SHALL have a `plan` (`free` | `pro` | `agency`, default `free`); the server SHALL enforce Check count (free: 3), history window (free: 30 runs, pro/agency: 90 days), connector kinds and alert channels per plan, and the pricing page SHALL show the tiers with an Upgrade action.

#### Scenario: Free plan at the limit
- **WHEN** a free user with 3 Checks creates a fourth
- **THEN** the response is HTTP 402 with a link to the pricing page

#### Scenario: Upgrade before billing is wired
- **WHEN** a user clicks Upgrade and Paddle is not configured
- **THEN** the click is logged and a "what would you pay for" form is shown
