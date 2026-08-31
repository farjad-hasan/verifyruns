## ADDED Requirements

### Requirement: Public status pages are shareable, not discoverable
`/status/*` responses SHALL carry an `X-Robots-Tag: noindex` header (`frontend/public/_headers`), and the public status route SHALL also set a `noindex` robots meta tag, so status pages reach only people given the link. `robots.txt` SHALL NOT disallow `/status/` — a Disallow would stop crawlers from ever seeing the noindex, leaving shared links indexable URL-only. Enabling a public page SHALL require the same confirmation the disable action already has, naming what becomes visible (check name, verdicts, diff sentences).

#### Scenario: Crawler finds a shared link
- **WHEN** a public status URL appears on a crawled page
- **THEN** the crawler fetches it, reads the noindex header, and drops it from the index — it never becomes searchable

#### Scenario: Owner enables sharing
- **WHEN** the owner clicks Enable on the public status card
- **THEN** a confirmation states that the check name and its diff sentences become visible to anyone with the link
