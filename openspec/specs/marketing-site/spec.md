# marketing-site Specification

## Purpose
TBD - created by archiving change landing-page-sell. Update Purpose after archive.

## Requirements

### Requirement: The diff message is the hero
The landing page SHALL show a rendered FAIL card with a real diff message next to the run timeline above the fold, a "who this is for" statement, and per-platform setup snippets for n8n, Make and Zapier.

#### Scenario: First visit
- **WHEN** a logged-out visitor opens `/`
- **THEN** they see a FAIL card reading "Run reported success, but the destination gained 0 records…" without scrolling
