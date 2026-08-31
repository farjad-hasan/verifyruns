## ADDED Requirements

### Requirement: Public status pages are shareable, not discoverable
`frontend/public/robots.txt` SHALL disallow `/status/`, and the public status route SHALL set a `noindex` robots meta tag, so status pages reach only people given the link. Enabling a public page SHALL require the same confirmation the disable action already has, naming what becomes visible (check name, verdicts, diff sentences).

#### Scenario: Crawler finds a shared link
- **WHEN** a public status URL appears on a crawled page
- **THEN** robots rules and the noindex tag keep it out of search indexes

#### Scenario: Owner enables sharing
- **WHEN** the owner clicks Enable on the public status card
- **THEN** a confirmation states that the check name and its diff sentences become visible to anyone with the link
