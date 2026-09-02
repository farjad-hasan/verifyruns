## 1. Layout below `sm`

- [x] 1.1 `CheckDetail.jsx` run history row: `flex-col gap-2 sm:flex-row sm:items-center sm:gap-5`; badge + sentence grouped in a `min-w-0 flex-1` block, timestamp and trigger grouped in a `shrink-0` mono block; `data-testid="run-row-{id}"` stays on the button. Verified 2026-09-03 on the local build in a 386 px CSS frame (Edge would not resize below ~500 px; a same-origin iframe on the dev server was used): sentence 232 px wide beside the badge in a 336 px row, "9/3/2026, 2:45:54 AM · WEBHOOK" on its own line beneath; no horizontal overflow (`scrollWidth === innerWidth`)
- [x] 1.2 `PublicStatus.jsx` run rows: same structure as 1.1 (`data-testid="public-run-{id}"` kept); verified at 386 px on a locally enabled public page, same layout
- [x] 1.3 `CheckDetail.jsx` header: `flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between`; verified at 386 px: H1 spans 338 px (the full content width), Rename beneath it, Snooze / Run Check now / Delete on their own row (actions top 310 px, H1 bottom 250 px); at 1720 px the actions sit right of the name as before
- [x] 1.4 `CheckDetail.jsx` "Run history" label + `RunFilters`: `flex-wrap gap-3` on the row and `flex-wrap` on the three selects. First pass left the selects unwrapped and the page scrolled 41 px sideways at 386 px; fixed, re-measured: `scrollWidth 386 === innerWidth 386`, no element past the right edge

## 2. No nested interactive content

- [x] 2.1 `Timeline.jsx`: `static` prop; real squares render as `<span role="img" aria-label title>`; empties unchanged
- [x] 2.2 `Dashboard.jsx`: the row is `<Link to="/checks/{id}">` with the same classes and `data-testid`; both strips pass `static`. Verified in the live DOM (1720 px and 386 px): each row is an `<a href="/checks/…">` containing 0 `<button>` elements and 10 / 0 `role="img"` squares; `useNavigate` import removed
- [x] 2.3 `CheckDetail.jsx` `CheckNameHeader`: `<h1>` and a visible ghost-xs "Rename" button (`aria-label`, `data-testid="rename-check-trigger"`) are siblings in a `flex-wrap` row; verified `document.querySelector('button h1') === null`. Side effect worth keeping: the rename affordance is now visible on touch (08-29 audit, Nielsen #6)

## 3. One expectations form

- [x] 3.1 `components/ExpectationsFields.jsx`: `ExpectationsFields` (growth mode + `MODE_HINT`, minimum new records, required fields, non-empty fields) and `HeartbeatField`, both keyed by `idPrefix` / `testidPrefix`; `MODE_HINT` moved here from `NewCheck.jsx` and exported
- [x] 3.2 `NewCheck.jsx` uses both; verified every `check-*` test id present and each control's `<label for>` resolves: "Growth mode", "Minimum new records per run", "Required fields (comma-separated)", "Fields that must be non-empty", "Expect a run every … hours (blank = off)"
- [x] 3.3 `CheckDetail.jsx` `ExpectationsCard` edit mode uses both with `idPrefix="edit"`; the store-samples checkbox stays (wrapped label). Verified after opening the editor: all five `edit-*` controls resolve to the same five labels, `edit-store-samples` is label-wrapped
- [x] 3.4 `?? 1` fallbacks left as they are: the worker always writes `min_new_records` (`validate.ts:24,43`, default 1) so the fallback never renders. Recorded, not changed

## 4. Copy and controls

- [x] 4.1 `index.css` `.rp-btn-xs` (6 × 12 px, 12 px type) placed after the three button classes; the four inline `!py-1.5 !px-3 !text-xs` overrides replaced (`CopyButton`, Edit, Enable, rename Save/Cancel); Enable → `rp-btn-ghost rp-btn-xs`, Disable and channel Remove → `rp-btn-danger rp-btn-xs`. Verified live: `enable/disable-public-btn` and `remove-channel-*` carry the classes and match Edit's size in the screenshots. `DESIGN.md`: `button-ghost-xs` / `button-danger-xs` in the components frontmatter plus the Do
- [x] 4.2 `font-mono` dropped from "Loading…" (`App.js`, `Dashboard.jsx`, `CheckDetail.jsx`, `PublicStatus.jsx`) and from both no-runs sentences; verified the zero-run state card sentence computes to `font-family: Manrope`. `DESIGN.md` Do added
- [x] 4.3 `CheckDetail.jsx`: `runHistory` is `null` while `runs.length === 0`; `PublicStatus.jsx` hides "Recent verdicts" the same way. Verified on the zero-run Check: `body.innerText` contains "No runs yet" exactly once and no `run-filters` element renders
- [x] 4.4 `<h2>` for the five Check-detail card titles and `NewCheck.jsx` `Section`; verified `document.querySelectorAll('h2')` lists Alert channels, Public status page, Webhook URL, Destination, Expectations on detail and Name, Destination, Expectations, Heartbeat, Alert channel on New Check
- [x] 4.5 "Check" spelled per PRODUCT.md: New Check H1 / submit / title, dashboard "New Check" and "Create your first Check", detail "Run Check now", delete confirm, eyebrow "{connector} Check" (also on the public page), public-enable confirm, "failing Check", "the Check recovers", load-error sentence, rename toast; `NewCheck.jsx` "from the Check page". A `grep` over the four pages leaves only identifiers, test ids, URLs, the verb, and the engine's own "checks were skipped" regex

## 5. Verify locally, then push

- [x] 5.1 `cd frontend && CI=true corepack yarn build` — 2026-09-03: compiles; `main.js` 233.73 kB gzipped. The only warnings are "Failed to parse source map" from `node_modules/browser-common` (a dependency's missing `.mjs` sourcemaps), identical on `main` built with the same `node_modules` (`git stash` → 125 → `git stash pop` → 125), so no new warnings
- [x] 5.2 Edge walk on the local stack (worker `npm run dev` on :8787 with the local D1 migrated to 0004, frontend on :3100 from this worktree, a throwaway local account seeded through the API with two Checks and five runs incl. two FAILs, public page enabled) at 1720 px and in a 386 px frame: dashboard, Check with runs, Check with none, New Check, public status — every item above recorded with what was seen
- [x] 5.3 `openspec validate check-detail-phone --strict` passes; `DESIGN.md` changed in the same commit
- [ ] 5.4 Blind review of the diff (`.claude/agents/blind-reviewer.md`); fix or record every finding here before opening the PR
- [ ] 5.5 PR from `check-detail-phone` to `main`; merge is a deploy (`docs/deploy.md`) — flip the `CLAIMS.md` row to `done` in the merge commit
