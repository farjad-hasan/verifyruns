## MODIFIED Requirements

### Requirement: Security headers on both origins
Every API response SHALL carry `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The Pages site SHALL serve a `Content-Security-Policy` that allows scripts only from its own origin, connections only to its own origin and the API origin, styles and fonts only from its own origin, and no framing, plus the same transport and sniffing headers, via `frontend/public/_headers`. The site SHALL load no third-party analytics or tracking script, and the CSP SHALL be the enforcement: a beacon the hosting platform injects is blocked by it. The privacy policy's statement that there are no analytics trackers depends on this requirement; a change that adds any such script SHALL change this requirement, the privacy policy and the security page in the same change.

#### Scenario: Injected script
- **WHEN** a script from a third-party origin is referenced by the SPA
- **THEN** the browser refuses to run it and reports a CSP violation

#### Scenario: Platform-injected analytics beacon
- **WHEN** the hosting platform injects an analytics beacon script into the served HTML
- **THEN** the CSP blocks it and no request leaves the page to the analytics origin

#### Scenario: No third-party origin on a page load
- **WHEN** any route is loaded with an empty cache
- **THEN** every request the page makes goes to the site's own origin or the API origin
