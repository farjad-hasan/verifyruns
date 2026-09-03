## Why

Only the landing page has a footer. Every other public page ends with an improvised closing line
and no two agree: `/pricing` — the one page about charging — cannot reach the Terms at all;
`/data`, `/security`, `/privacy` and `/terms` each carry a different hand-written link list in a
different order; the auth pages and the 404 have nothing; the app pages (dashboard, Check detail,
New Check) end at their last card. The public status page hand-copies the nav markup at a narrower
width, and the nav does not know which page it is on, so `/login` shows a "Log in" link to itself.
Around that shell gap sit a handful of one-line drifts the 2026-09-02 audit
(`docs/design-audit-2026-09-02.md`, Part 1) found: the Free pricing card's first feature line
breaks because "(planned)" is a separate flex child; the legal pages missed the 65 ch measure the
other prose pages got; prose section headings are `<p>`s; the legal H1's full stop leaks into the
browser tab; `/data` and `/security` say "true as of August 2026" while the legal pages carry a
mono "Last updated" line; a hand-typed `v0.2` disagrees with both package manifests; inline links
use three treatments.

## What Changes

- **One `Footer`** rendered by every route, public and app, in the nav's `max-w-6xl` container:
  the logo tile and wordmark, then Pricing · What we store · Security · Privacy · Terms, in that
  order everywhere. A `slim` variant for `/status/:token` keeps "Read-only status page powered by
  VerifyRuns" and adds Privacy and Terms. The ad-hoc closing link lines on Data, Security, Privacy
  and Terms are removed; body pointers (self-hosting docs) stay as body text. The version string
  is dropped.
- **`Nav` gains `variant="public"`** (logo + "Public status" label, no account controls) and the
  status page uses it instead of its own copy, so the header sits at the same width on every page.
  When logged out, the nav hides the link that matches the current route.
- **Prose pages**: `max-w-[65ch]` on the legal lede, paragraphs and lists; section titles become
  `<h2>`; one mono "Last updated" line on all four docs pages, sourced from the date each restates.
- **One inline-link rule** (`.rp-inline`) replaces the three class strings used on public pages.
- **Pricing**: the feature line's text is wrapped so each `<li>` has two flex children.
- **Legal tab titles** drop the H1's trailing full stop; the 404's primary action follows auth
  state (dashboard when logged in, home otherwise).

## Capabilities

### Modified Capabilities
- `marketing-site`: "Explanatory pages are linked from every public page" — the link set and
  order come from one footer on every route, not only the landing page.
- `app-shell`: new requirement for the shared footer and nav variant.
- `design-system`: new requirements for the inline-link rule, the prose measure and heading
  hierarchy on documentation pages.

## Impact

`frontend/src/components/Nav.jsx`, a new `frontend/src/components/Footer.jsx`,
`frontend/src/pages/{Landing,Pricing,DataPage,SecurityPage,LegalPage,PrivacyPage,TermsPage,
AuthPage,ForgotPage,ResetPage,NotFound,PublicStatus,Dashboard,NewCheck,CheckDetail}.jsx`,
`frontend/src/index.css`, `DESIGN.md`. No API change; every `data-testid` kept (the landing's
`footer-*` ids move into `Footer`). Sequential after `check-detail-phone` (merged 2026-09-03).
