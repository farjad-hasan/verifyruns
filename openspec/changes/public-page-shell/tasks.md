## 1. Shell components

- [ ] 1.1 `components/Footer.jsx`: `<footer className="border-t border-raised mt-auto">`, `max-w-6xl` container, logo tile + wordmark linking to `/`, links Pricing · What we store · Security · Privacy · Terms as `rp-link` (`data-testid="footer-pricing|data|security|privacy|terms"` kept); `slim` variant: one centred line "Read-only status page powered by VerifyRuns · Privacy · Terms"
- [ ] 1.2 `Nav.jsx`: `variant="public"` renders logo + the mono "Public status" label and no account controls; logged-out nav hides the link matching `useLocation().pathname` (`/login` → no "Log in", `/signup` → no "Get started")
- [ ] 1.3 Every page root becomes `min-h-screen flex flex-col` with `<Footer />` last: Landing (replacing its inline footer), Pricing, DataPage, SecurityPage, LegalPage, AuthPage, ForgotPage, ResetPage, NotFound, Dashboard, NewCheck, CheckDetail; PublicStatus uses `<Nav variant="public" />` and `<Footer slim />` (its hand-rolled header and "powered by" line removed). Verify every route ends with the same footer at 1720 px and in a 386 px frame, and that the auth pages still centre their form

## 2. Prose pages

- [ ] 2.1 `LegalPage.jsx`: `max-w-[65ch]` on the lede, paragraphs and lists; section titles `<h2>`; the closing link line removed; `useTitle` receives the title without its trailing full stop (tab reads "Privacy policy — VerifyRuns")
- [ ] 2.2 `DataPage.jsx`, `SecurityPage.jsx`: section titles and the vulnerability card title `<h2>`; "true as of August 2026" leaves the lede and a mono "Last updated {date}" line follows it, with the date of the doc each page restates (`docs/what-we-store.md` 2026-08-31, `docs/security.md` 2026-09-01); the closing "See also" / link lists removed, the self-hosting sentences kept
- [ ] 2.3 `index.css` `.rp-inline` (underline, 4 px offset, hover to `#D4D4D8`, 160 ms); every `underline underline-offset-4[ hover:text-…]` on the public pages and auth pages replaced with it; `DESIGN.md` records the rule under Do's
- [ ] 2.4 `Pricing.jsx:62`: wrap the feature text in a `<span>` so the `<li>` has exactly two flex children; verify at 1720 px "(planned)" follows "history" inline
- [ ] 2.5 `NotFound.jsx`: primary action is "Go to dashboard" when `useAuth().user` is set, "VerifyRuns home" otherwise

## 3. Verify locally, then push

- [ ] 3.1 `cd frontend && CI=true corepack yarn build` compiles with no warnings beyond the 125 dependency source-map notices on `main`
- [ ] 3.2 Edge walk on the local stack at 1720 px and in a 386 px frame: `/`, `/pricing`, `/data`, `/security`, `/privacy`, `/terms`, `/login`, `/signup`, `/forgot`, `/reset`, a 404, `/status/:token`, `/dashboard`, `/checks/:id`, `/checks/new`; record per route that the footer renders, the nav variant is right, and there is no horizontal overflow
- [ ] 3.3 `openspec validate --all --strict`; `DESIGN.md` changed in the same commit and `.impeccable/design.json` refreshed so `context.mjs` reports no `CONTEXT_STALE`
- [ ] 3.4 Blind review of the diff; fix or record every finding here before opening the PR
- [ ] 3.5 PR from `public-page-shell` to `main`; merge is a deploy — flip the `CLAIMS.md` row to `done` and archive in the coordination commit after merge
