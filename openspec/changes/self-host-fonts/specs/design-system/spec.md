## MODIFIED Requirements

### Requirement: Only the system typefaces load
Pages SHALL use only Outfit, Manrope and JetBrains Mono, served from the site's own origin as vendored files under their SIL Open Font License; no page SHALL request any font provider, and no page SHALL request Inter or any other family.

#### Scenario: Font requests on first load
- **WHEN** `/` is loaded with an empty cache
- **THEN** every font request goes to the site's own origin and names only Outfit, Manrope or JetBrains Mono, and no request goes to `fonts.googleapis.com` or `fonts.gstatic.com`
