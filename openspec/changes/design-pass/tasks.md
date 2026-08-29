## 1. Design authority and tooling (done in this proposal's session, 2026-08-29)

- [x] 1.1 Write `PRODUCT.md` (impeccable `init`, facts marked inferred where not confirmed) and verify `node .claude/skills/impeccable/scripts/context.mjs` resolves it
- [x] 1.2 Write `DESIGN.md` in Stitch DESIGN.md format from `index.css` + components (impeccable `document`, scan mode) and verify `parseDesignMd` reads every token; write `.impeccable/design.json` sidecar and verify it parses
- [x] 1.3 Vendor impeccable into `.claude/skills/impeccable/` (`npx impeccable install --providers=claude --scope=project`); hook lands in the gitignored `.claude/settings.local.json` (machine-local — re-run the installer on the Windows box)
- [x] 1.4 `git rm design_guidelines.json`; verify nothing else references it (`grep -r design_guidelines` → only the archived remove-python-backend proposal)
- [x] 1.5 Run `npx impeccable detect` on `/`, `/pricing`, `/data`, `/security`, `/login` at 1280×800 and 390×844 and record counts (49 / 29) in `docs/design-audit-2026-08-29.md`
- [x] 1.6 Commit 1.1–1.5 plus `docs/design-audit-2026-08-29.md` and this change as `design-pass: design authority + audit`; verify `openspec validate design-pass --strict` passes

## 2. Tokens and contrast

- [x] 2.1 Extend `tailwind.config.js` with DESIGN.md tokens (`ink`, `ink-alt`, `panel`, `raised`, `hairline`, `hairline-hover`, `muted: #8A8A93`, `verdict-pass`, `verdict-fail`) and verify the build compiles
- [x] 2.2 Replace `text-zinc-500` → `text-muted` and `text-zinc-600` (text use only) → `text-muted` across `frontend/src/pages/{Landing,Dashboard,CheckDetail,NewCheck,PublicStatus,Pricing,AuthPage,DataPage,SecurityPage}.jsx` and `components/*`; update `DESIGN.md` frontmatter `text-muted` and the sidecar; verify `npx impeccable detect` reports zero `low-contrast` on the five public URLs — verified on the local build 2026-08-29: 0 low-contrast, 0 undersized-ui-text, 0 overused-font; totals 49→35 desktop, 29→16 mobile. NB: the token is `quiet`, because shadcn already owns `muted` (`hsl(var(--muted))`) in `tailwind.config.js` and the later key silently won
- [x] 2.3 Replace hard-coded `border-[#27272A]`, `bg-[#0A0A0A]`, `bg-[#18181B]`, `divide-[#27272A]`, `hover:border-[#3F3F46]` with the tokens from 2.1; verify `grep -rn "#[0-9A-F]\{6\}" frontend/src/pages frontend/src/components` returns only `index.css`-owned values
- [x] 2.4 Raise every `text-[10px]` to `text-[11px]` (`Dashboard.jsx:66,69,140`, `Landing.jsx:137`) and verify the detector reports zero `undersized-ui-text`
- [x] 2.5 Delete the Inter `<link>` from `frontend/public/index.html:10`; verify a cold load of `/` requests only Outfit, Manrope, JetBrains Mono (Network tab or `impeccable detect` `overused-font` = 0)

## 3. Verdict second channel

- [x] 3.1 `index.css`: `.tl-square.fail` becomes a 3 px inset ring on a transparent fill; `.tl-square.pass` stays solid; hover glows unchanged. Verify in a greyscale screenshot (macOS: Accessibility → Display → Color Filters → Grayscale, or `sips -M`) that FAIL squares are distinguishable at 12 px and 16 px
- [x] 3.2 `Timeline.jsx`: real squares get `aria-label="{verdict} · {localised time}"` (keep `title`), empties get `aria-hidden="true"`; verify with VoiceOver or `read_page` that a square's accessible name states the verdict
- [ ] 3.3 `Dashboard.jsx` HealthStrip: replace the three 8 px dots with 12 px tiles using `.tl-square` (`pass`, `fail`, empty) so the strip shares the primitive; verify the same greyscale check
- [x] 3.4 `PublicStatus.jsx` and `Landing.jsx` static strip inherit 3.1 with no JSX change — verify by screenshot; `Landing.jsx:107` `price` loses `text-emerald-300` (Two-Meaning Rule) and becomes `text-zinc-100`
- [x] 3.5 Empty timeline slots become ghosts: `.tl-square` base background `#1C1C1F` (token `timeline-empty`), and the caption reads `${runs.length} of 30 runs` while under 30 on detail and public page; verify a 3-run check reads as three bright squares on a quiet strip

## 4. Masking and API additions (worker)

- [x] 4.1 `worker/src/` `sanitizeCheck`: rewrite `config.url` so each query value is `••••` + last 4, keys and path intact; add a pure function `maskQueryValues(url)` with tests in `worker/test/` covering no query, one key, repeated keys, and a value shorter than 4 chars; verify `npm test` green
- [x] 4.2 Verify the Check edit path round-trips an untouched URL with `?apikey=` unchanged (test: PATCH without `config.url` preserves the stored URL; PATCH with the masked string is rejected or ignored, never stored)
- [x] 4.3 `listChecks`: add `diff_message` to the `recent_runs` SELECT; verify `GET /api/checks` returns it on every run and the public endpoint is unchanged (existing public-status tests pass)
- [x] 4.4 Public endpoint `GET /api/public/checks/{token}` adds `checked_at` (timestamp of the newest run), `heartbeat_hours`, and per run `alerts_sent: [{kind, ok}]` with the target stripped; tests assert the target and `error` fields never appear in the public payload
- [x] 4.5 `npm run typecheck` and full `npm test` in `worker/` green; paste counts into this task — 2026-08-30: `tsc --noEmit` clean; `vitest run` on the 13 files in scope (all but the in-flight `hardening.test.ts`/`concurrency.test.ts` another change was adding to the same tree at the time) = **13 files passed, 102 passed | 5 skipped (107)**; the 5 skips are the Postgres tests without Docker pg. Full-tree run at the same moment: 110 passed | 5 skipped | 1 failed (116), the failure being `hardening.test.ts` (alert-target validation, not this section). New tests: `worker/test/mask.test.ts` (6), `worker/test/public.test.ts` (2), plus one each in `checks.test.ts` and `runs.test.ts`

## 5. Check detail and dashboard

- [ ] 5.1 `Dashboard.jsx`: render the newest run's `diff_message` under the check name in Manrope `text-sm text-zinc-300`, full width, never truncated; verify on the dogfood check the FAIL sentence appears on the row
- [ ] 5.2 `CheckDetail.jsx`: H1 steps down to `text-3xl`; add a "Latest verdict" block directly under it — badge, full sentence at `text-lg sm:text-xl` in `text-primary`, mono "`{relative} ago · {trigger}`" — shown when `runs.length > 0`; verify the sentence is above the fold at 1280×800 and is the largest body text on the page
- [ ] 5.3 `CheckDetail.jsx`: when `runs.length > 0`, order becomes header → Latest verdict → timeline → Run history → Alert channels → Public status → a collapsed "Setup" `<details>` holding Webhook, Destination, Expectations; zero-run order unchanged; verify both states in Edge
- [ ] 5.4 Replace the hand-rolled `RunPanel` overlay with the shadcn `Sheet` (`components/ui/`), keep `data-testid="run-panel"` on the content; verify Escape closes, focus returns to the square, and the body does not scroll behind it
- [ ] 5.5 `CheckDetail.jsx` "Last 30 runs" → `Last ${timelineRuns.length} runs`; in-app curl examples gain `?wait=30`; `DiffRow` colours the delta by verdict, not by sign, when `growth_mode === "steady"`; verify by screenshot and a steady-mode run
- [ ] 5.6 Load failures: Dashboard and CheckDetail set an `error` string (404 → "This check doesn't exist or was deleted."; other → "Could not reach VerifyRuns. Retrying in 10 s.") rendered in a card with Retry and the back link; verify by opening `/checks/does-not-exist`
- [ ] 5.7 `Nav.jsx:38` delete-account control: `aria-label`, 44 px hit area; verify with `read_page` interactive filter

## 6. Forms and public page

- [ ] 6.1 `NewCheck.jsx` Destination inputs (`:116-127,133-139,144-153`): visible `<label for>` in the Expectations label style, "(optional)" in the label text, `type="password"` with a reveal toggle for bearer token / PAT / DSN; verify each input's accessible name with `read_page`
- [ ] 6.2 `NewCheck.jsx:103` connector cards `grid-cols-1 sm:grid-cols-3`; growth-mode `<option>` text shortened to the mode name with the sentence moved to a hint under the select; verify at 390 px (detector `--viewport 390x844` on a local dev URL) no horizontal scroll
- [ ] 6.3 `CheckDetail.jsx` Alert channels input (`:474`) and the three `RunFilters` selects (`:689-715`) get labels (visually hidden is acceptable for the filters, with `aria-label`); verify accessible names
- [ ] 6.4 `PublicStatus.jsx` (teammate monitoring page): connector label from `data.connector_kind` via `connectorLabel`; "as of {checked_at} ({timezone})" line under the timeline; "expects a run every {heartbeat_hours} h" beside it when set; "alerted: slack ✓ · email ✗" on the latest run from `alerts_sent`; `break-words` on the H1; verify on a temporarily enabled public page for the dogfood check (disable again afterwards, or use a throwaway check)
- [ ] 6.5 Timeline at narrow widths: `.tl-square { flex-shrink: 0 }`, container `overflow-x-auto` right-anchored and scrolled to end on mount; `Dashboard.jsx:76` shows the last 10 squares below `sm` instead of hiding; verify at 390 px on dashboard, detail and public page that the newest square is visible without scrolling

## 7. Marketing pages and detector hygiene

- [x] 7.1 `max-w-[65ch]` on the article column of `DataPage.jsx`, `SecurityPage.jsx`, and the intro paragraph of `Pricing.jsx`; `Landing.jsx` hero gets `px-6` inside the grid at 390 px; verify detector `line-length` and `body-text-viewport-edge` = 0 — 2026-08-29: viewport-edge 0 (root cause was `min-width:auto` on the hero grid columns, fixed with `min-w-0`); one 98-char `line-length` remains on `/security` (an `<li>`), accepted
- [x] 7.2 Remove the app-page eyebrows ("DASHBOARD", "NEW CHECK"); record intentional ignores — `.rp-grid` and `leading-[1.05]` inline, the pulsing early-access dot inline, sonner `height 400ms` in `.impeccable/config.json` `detector.ignoreValues`, `kicker-above-heading` ignored for the four marketing pages; verify `npx impeccable detect` on the five public URLs at both viewports reports only the recorded exceptions — 2026-08-29 on the local build: desktop 2 (1 line-length + em-dash advisory), mobile 1 (advisory)
- [x] 7.3 Amend `DESIGN.md` One Blur Rule to "nav and modal scrims"; regenerate `.impeccable/design.json`; verify `context.mjs` reports no `CONTEXT_STALE`

## 8. Verify locally, then push

- [ ] 8.1 `cd worker && npm test && npm run typecheck` green; `cd frontend && npm run build` compiles with no new warnings
- [ ] 8.2 `/impeccable polish` pass over dashboard, check detail, new check, public status against the running app (`localhost:3100` in Edge), desktop and 390 px; fix what it shows in one batch
- [ ] 8.3 Re-run `npx impeccable detect` on the five public URLs at both viewports and paste the before/after counts (49/29 → ?) into `docs/design-audit-2026-08-29.md`
- [ ] 8.4 Commit in reviewed groups (tokens; verdict channel; worker; detail+dashboard; forms+public; marketing) and push; deploy Worker + Pages together; verify the dogfood check's dashboard row shows its sentence on the live site
