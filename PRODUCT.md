# Product

<!-- impeccable:product-schema 1 -->

Written 2026-08-29 from the repository (README, `openspec/specs/`, `frontend/src/`) and the
`design_guidelines.json` this file and `DESIGN.md` replace. A short product interview with Farjad on 2026-08-29 confirmed the items marked *(confirmed
2026-08-29)*; everything else is read from the landing copy and README.

## Platform

web

## Users

- **Automation agencies** running n8n / Make / Zapier workflows for clients ("agencies at client
  #21"). Situation: a client asks whether the sync ran; "it ran" is not an answer they can give.
  Job: prove the destination actually changed, and hand the client a status page.
- **Operators whose own syncs touch money** — orders, invoices, CRM records. Situation: a green
  run that wrote nothing costs money before anyone notices. Job: get told, in one sentence, when a
  successful run did not land.
- Both are technical enough to paste an HTTP node and read a webhook URL; neither wants to read a
  score or a model's opinion.
- **Primary user: undecided** *(confirmed 2026-08-29)* — solo operator, small internal ops team and
  agency are all live candidates. Until decided, layout trade-offs are made for the **solo operator
  on a phone** as the smallest case, and nothing is built that only an agency needs (per-client
  grouping, branded pages).
- **Team model: the public status link is the team mechanism** *(confirmed 2026-08-29)*. Accounts
  stay single-user; teammates monitor a Check through its read-only link. No org/roles work is
  planned.

## Product Purpose

Every monitoring tool watches the *run*. VerifyRuns re-reads the *destination* after each run,
fingerprints it, diffs it against the last 30 good runs, and emits a plain-English PASS or FAIL
("Run reported success, but your workflow said it wrote 3 records; the destination gained 0, and
the field `price` disappeared"). Success is a user seeing a FAIL they would otherwise have found
three days later from a customer email.

## Positioning

**The sentence is the product.** A neighbour can copy uptime, retries and run logs; they cannot
truthfully claim to have read the destination after the run and reconciled it against what the
workflow said it wrote (`{"wrote": N}`). Deterministic rules, no model, no score — every verdict is
a pure function with tests in `worker/test/`. Origin story on the landing page: one of Farjad's own
scheduled jobs hit a lock, exited 0 and recorded nothing.

## Operating Context

- Set-up is three steps in about four minutes: create a Check (HTTP/JSON, Airtable, or read-only
  Postgres destination), paste one HTTP Request node at the end of the workflow, get verdicts.
- Verdicts arrive on the dashboard, on a public read-only status page (`/status/:token`) **for
  teammates to monitor the same Check without an account** *(confirmed 2026-08-29; the landing copy's
  "hand it to a client" line is a secondary use, not the design target)*, and via Slack / Discord / email — on the first FAIL and again on recovery,
  never one message per red run.
- Heartbeat rule: "expect a run every N hours"; a missing run is itself a FAIL.
- The n8n community node (`verifyruns-n8n`) fails the execution on FAIL; the webhook returns the
  verdict in the same request (`?wait=30`).
- Runs store counts, field names and a hash of the newest row — never the rows — unless samples are
  opted in (30-day expiry). `/data` and `/security` pages restate `docs/what-we-store.md` and
  `docs/security.md` and must stay in agreement with them.

## Capabilities and Constraints

- Routes: `/` (landing), `/login`, `/signup`, `/dashboard`, `/checks/new`, `/checks/:id`,
  `/status/:token` (public), `/pricing`, `/data`, `/security`; `/forgot`, `/reset`, `/terms`,
  `/privacy` are being added by the in-flight `password-reset` and `legal-pages` changes.
- Stack: React 19 + Tailwind + shadcn/ui (CRA, `react-scripts`), Cloudflare Worker + D1 API,
  Cloudflare Pages hosting. Dev: `cd frontend && PORT=3100 npm start` against `localhost:8787`.
- **Early access: everything is free, no card.** Pricing shows *planned* prices; the "I'd pay for…"
  CTA only records interest. Real billing is the `pricing-tiers` OpenSpec change (Paddle), gated on
  ≥10 external users with a live Check. UI must not imply a charge exists.
- Planned work goes through OpenSpec (`openspec/changes/<name>/` with `tasks.md`); design work is no
  exception.
- Terminology: **Check** (the thing you create), **run** (one webhook arrival), **verdict**
  (PASS / FAIL), **diff message** (the sentence), **destination**, **connector**, **heartbeat**,
  **timeline** (the 30-square strip, newest on the right).
- Every interactive and key informational element carries a `data-testid` (carried over from the
  Emergent build; tests depend on it).
- Vercel-style "AI feel" is explicitly not wanted: no fake seed data in empty states, no emoji as
  icons, no glassmorphism, no gradients on dark surfaces.
- **Dark-only is NOT a binding commitment** *(confirmed 2026-08-29: not selected as a constraint)* —
  a light theme is not planned but not excluded, so tokens stay semantic (`ink`, `panel`, `muted`)
  rather than hard-coded hexes in components.
- **Binding** *(confirmed 2026-08-29)*: deterministic / no model / no score in any UI copy or
  visual; free early access with no card implied; first-person author voice on the landing page.
- The public status page SHALL additionally show, for teammates: when the Check was last
  evaluated (absolute time with timezone), whether alerts were delivered for the latest FAIL (per
  channel kind, ok/not — never the target), and the heartbeat expectation ("expects a run every
  28 h") *(confirmed 2026-08-29)*.

## Brand Commitments

- Name: **VerifyRuns**. Mark: Lucide `Activity` glyph in an emerald tile. Version string in footer
  (`v0.2`).
- Voice: direct, technical, first person where it earns it ("I built the check my own agents
  needed"). Verdicts are quoted word for word; the landing FAIL card must be a real sentence.
- Verdict sentences are never truncated (`marketing-site` spec) — the whole sentence is readable
  wherever it appears.
- The 30-run timeline is the hero component on the dashboard, check detail and public status page.
- Empty states teach the 3-step setup; they are never seeded with dummy data.

## Evidence on Hand

- `docs/media/forced-fail.gif` — a real public status page going PASS → FAIL.
- Real verdict copy in `frontend/src/pages/Landing.jsx` (hero FAIL card) and the README.
- Per-platform setup docs: `docs/n8n.md`, `docs/make.md`, `docs/zapier.md`.
- Dogfood: farjad-world's launchd fleet reports every job to a VerifyRuns check (heartbeat 28 h).
- **Absent — do not fabricate:** customer logos, testimonials from anyone other than Farjad, usage
  numbers, uptime claims, paying customers.

## Product Principles

1. **Say the sentence.** Every state — PASS, FAIL, empty, error — is a readable sentence, not an
   icon or a number alone.
2. **Deterministic and inspectable.** Nothing in the UI should suggest a score, confidence or
   model; a user can always find the rule that fired.
3. **Newest on the right, always.** The timeline is the shared mental model across every surface.
4. **Honest about state.** Early access, planned prices, known security gaps and what is stored are
   said plainly on the surface, not in a footer.
5. **Four minutes to first verdict.** Every screen between signup and the first run exists to
   shorten that, and the empty state is the onboarding.

## Accessibility & Inclusion

- PASS / FAIL is currently encoded by red-vs-green hue alone in the timeline squares, badges and
  health strip *(observed 2026-08-29)*. A second channel (glyph, shape or luminance) is required
  wherever verdict colour appears, because the product's core signal must survive colour-vision
  deficiency and greyscale screenshots pasted into Slack.
- Public status pages are viewed by people who never signed up and may be on a phone; the
  timeline must remain legible at narrow widths without hiding runs.
