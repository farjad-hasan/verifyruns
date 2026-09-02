## 1. Layout below `sm`

- [ ] 1.1 `CheckDetail.jsx` run history row: `flex-col gap-2 sm:flex-row sm:items-center sm:gap-5`; badge + sentence grouped in a `min-w-0 flex-1` block, timestamp and trigger grouped in a `shrink-0` mono block; `data-testid="run-row-{id}"` stays on the button. Verify at ≤ 492 px the sentence spans the card width and the meta line sits beneath it
- [ ] 1.2 `PublicStatus.jsx` run rows: same structure as 1.1 (`data-testid="public-run-{id}"` kept)
- [ ] 1.3 `CheckDetail.jsx` header: `flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between`; verify at ≤ 492 px the eyebrow and H1 take the full width and the three actions sit on their own row beneath
- [ ] 1.4 `CheckDetail.jsx` "Run history" label + `RunFilters`: `flex-wrap gap-3`, filters `flex-wrap`; verify the label never breaks mid-phrase at ≤ 492 px

## 2. No nested interactive content

- [ ] 2.1 `Timeline.jsx`: add `static` prop; when set, real squares render as `<span role="img" aria-label="{verdict} · {time}" title=…>` instead of `<button>`, empties unchanged
- [ ] 2.2 `Dashboard.jsx`: the row becomes `<Link to="/checks/{id}">` with the same classes and `data-testid`; both strips pass `static`; verify in the live DOM that a row contains zero `<button>` elements
- [ ] 2.3 `CheckDetail.jsx` `CheckNameHeader`: the `<h1>` is a sibling of a small ghost-xs "Rename" button (`data-testid="rename-check-trigger"` kept on the button), not its child; verify the H1 is no longer inside a button

## 3. One expectations form

- [ ] 3.1 New `components/ExpectationsFields.jsx`: growth mode (`<select>` with one-word options + `MODE_HINT` beneath), minimum new records, required fields, non-empty fields; props are the four value/setter pairs plus `idPrefix`; every `<label htmlFor>` matches an `id`; the heartbeat field is a second export `HeartbeatField` with the create form's label
- [ ] 3.2 `NewCheck.jsx` uses both; behaviour unchanged (`data-testid`s `check-mode-select`, `check-minnew-input`, `check-required-input`, `check-nonempty-input`, `check-heartbeat-input` kept via a `testidPrefix`)
- [ ] 3.3 `CheckDetail.jsx` `ExpectationsCard` edit mode uses both (`edit-*` testids kept); the store-samples checkbox stays in the card; verify with `read_page` that all six edit controls have accessible names
- [ ] 3.4 Leave the `?? 1` fallbacks: the worker always sets `min_new_records` (`validate.ts:24,43`, default 1), so the fallback never renders; record that here rather than change it

## 4. Copy and controls

- [ ] 4.1 `index.css`: add `.rp-btn-xs` (`padding: 6px 12px; font-size: 12px`) composable with `rp-btn-ghost` / `rp-btn-danger`; replace the four inline `!py-1.5 !px-3 !text-xs` overrides (`CopyButton.jsx`, `CheckDetail.jsx` Edit, Enable, rename Save/Cancel) with it; Enable → ghost-xs, Disable → danger-xs, channel Remove → danger-xs; record `button-ghost-xs` and `button-danger-xs` in `DESIGN.md` components and the rule under Do's
- [ ] 4.2 Sentences in Manrope: `App.js:25`, `Dashboard.jsx:49`, `CheckDetail.jsx:136,310`, `PublicStatus.jsx:98,103` drop `font-mono`; add the Do to `DESIGN.md` ("mono is for observed values; a sentence the product speaks, including Loading and empty states, is Manrope")
- [ ] 4.3 `CheckDetail.jsx`: when `runs.length === 0` render no Run history block (the state card carries the one empty-state sentence); verify on a zero-run Check the page shows one "No runs yet" sentence
- [ ] 4.4 `<h2>` for card titles: `CheckDetail.jsx` Webhook URL, Destination, Expectations, Alert channels, Public status page; `NewCheck.jsx` `Section`; classes unchanged
- [ ] 4.5 Spell the noun "Check": `NewCheck.jsx` H1 "Create a Check", submit "Create Check"; `Dashboard.jsx` "New Check"; `CheckDetail.jsx` "Run Check now", "Delete this Check and all its runs?", eyebrow "{connector} Check", public confirm "this Check's name", toasts "Check created / renamed / deleted / queued"; `useTitle` fallback "Check" already correct. Verify with `grep -n "check\b" ` over the four pages that every remaining lower-case use is code, a URL, or the verb

## 5. Verify locally, then push

- [ ] 5.1 `cd frontend && yarn build` compiles with no new warnings; paste the result here
- [ ] 5.2 Edge walk on the local build (`PORT=3100`, worker `npm run dev`) or on the deployed preview at 1720 px and the narrowest Edge width: dashboard, a Check with runs, a Check with none, New Check; each item above ticked with what was seen
- [ ] 5.3 `openspec validate check-detail-phone --strict` passes; `DESIGN.md` changed in the same commit as the button/typeface rules
- [ ] 5.4 Blind review of the diff (`.claude/agents/blind-reviewer.md`); fix or record every finding here before opening the PR
- [ ] 5.5 PR from `check-detail-phone` to `main`; merge is a deploy (`docs/deploy.md`) — flip the `CLAIMS.md` row to `done` in the merge commit
