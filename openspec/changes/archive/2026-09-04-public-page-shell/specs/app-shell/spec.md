## ADDED Requirements

### Requirement: One footer and one nav on every route
Every route SHALL render the shared `Footer` (logo, wordmark, Pricing · What we store · Security · Privacy · Terms) in the nav's container width; `/status/:token` SHALL render its slim variant (the "powered by" line plus Privacy and Terms). The header on `/status/:token` SHALL be the shared `Nav` in its `public` variant, not a copy. When logged out, the nav SHALL NOT link to the route it is on.

#### Scenario: Auth page has a way onward
- **WHEN** a visitor opens `/forgot`
- **THEN** the page ends with the shared footer (Pricing · What we store · Security · Privacy · Terms)

#### Scenario: Nav on the login page
- **WHEN** a logged-out visitor opens `/login`
- **THEN** the nav shows "Get started" and no "Log in" link; on `/signup` it shows "Log in" and no "Get started"

#### Scenario: Status page header width
- **WHEN** `/status/:token` and `/` are opened at the same viewport
- **THEN** the logo sits at the same x-position on both
