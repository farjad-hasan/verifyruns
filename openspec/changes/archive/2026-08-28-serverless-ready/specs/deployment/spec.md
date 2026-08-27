## ADDED Requirements

### Requirement: Runs at zero cost on sleeping hosts
The frontend SHALL be deployable to Cloudflare Pages as a static build with client-side routes served by `public/_redirects` (`/* /index.html 200`) and the API origin supplied at build time by `REACT_APP_BACKEND_URL`. The API SHALL be deployable to Render's free web service from `render.yaml` with `VR_INTERNAL_TICKER=0`, and SHALL need nothing beyond MongoDB Atlas and an external scheduler hitting `/api/internal/tick`.

#### Scenario: Deep link on Pages
- **WHEN** a visitor opens `/checks/<id>` or `/pricing` directly on the Pages domain
- **THEN** the SPA loads and routes client-side instead of a Cloudflare 404

#### Scenario: API asleep
- **WHEN** the free API instance has slept and a webhook arrives
- **THEN** the request succeeds after a cold start; nothing time-based was lost because the scheduler drives ticks
