# The VerifyRuns story — source notes for the video

Status as of 2026-09-08: VerifyRuns stays live as a **working lab**, not a business. The
product is complete enough to demo, costs nothing to run, and the repo carries three weeks of
recorded decisions. This file is the narrative spine for a long-form video, with the cuts that
become shorts and written posts. Facts below come from `git log`, `memory/PRD.md`,
`openspec/CLAIMS.md` and `docs/`. Nothing is embellished; where evidence is thin, it says so.

## One paragraph

A no-code automation (n8n, Make, Zapier) reports "success" and nobody checks whether the data
actually landed. VerifyRuns re-reads the destination after each run and posts PASS or FAIL with
a sentence a human can act on. It went from idea to live product in nine days, was then hardened
to production standard over two weeks with a stack of blind-reviewed PRs, and at the end of that
the honest question surfaced: who is going to pay for this? The answer looked like "not enough
people to matter", so the project became the thing it always secretly was, a full-stack
experiment in shipping a real web app on free and open-source tools.

## The pivot, stated plainly

- The niche is real but narrow. The person who builds n8n workflows can add a verification
  step inside n8n. The person who would pay for a dashboard usually already pays Make or
  Zapier, who show run history.
- Five launch posts (Show HN, Product Hunt, r/n8n, the n8n forum, an X thread) were drafted
  and never posted. Deleted 2026-09-08.
- An early-access pricing page and a willingness-to-pay endpoint exist. Nothing in the repo or the
  claims board records external paying intent. Pricing tiers are deferred until ten external live Checks exist; that
  trigger never fired.
- Everything that *did* prove out is engineering: the app works, the deploy pipeline works, the
  monitoring works, the restore works.

That is the honest arc, and it is the reason the story is worth telling. Most build-in-public
content skips the doubt.

## Timeline (from git)

| Date | Beat | Evidence |
|---|---|---|
| 2026-08-19 | Repo created. MVP scaffolded on an AI app builder (Emergent). FastAPI + MongoDB backend, React frontend. | Initial commit; `python-backend-final` tag later |
| 2026-08-24 | MVP complete. Renamed RunProof to VerifyRuns the same day. FAIL alerts, live refresh, editable expectations. | Four commits on one day |
| 2026-08-26 | OpenSpec adopted: baseline specs of the as-built app plus eleven tracked changes. Airtable connector, snooze, retry-before-alert. | `openspec/` |
| 2026-08-27 | The big feature day. Local dev without the builder's private package. Claimed-count reconciliation, heartbeats, Slack/Discord/email alerts, data minimisation, egress lockdown, landing and pricing pages. | Fourteen commits |
| 2026-08-28 | Serverless push. First a $0 layout on Render free + Atlas M0 + cron-job.org, then the same day a full port to **Cloudflare Workers + D1** in three stages. Live by evening. Python backend removed. | `cloudflare-workers-port`, `remove-python-backend` |
| 2026-08-29 | Postgres connector proven from the edge against Neon. Password reset, account deletion, terms and privacy. | |
| 2026-08-30 | Design pass with a written design authority. Concurrency guards, input hardening, `/api/health`, security headers, GitHub Actions CI. Two agent sessions collide in one checkout. | `routes: take back the publicCheck rewrite…` |
| 2026-08-31 | Production-readiness review produces seven changes, shipped as a stacked PR chain #1–#7, each blind-reviewed. `AGENTS.md` coordination rules written from the collision. | `openspec/changes/archive/2026-08-31-*` |
| 2026-09-01 | All seven deployed. PBKDF2 600k refused live by Cloudflare; the 100k fallback holds. Push-to-main deploy pipeline with staging gating production. | `docs/deploy.md`, memory note |
| 2026-09-02 | Operator work closed: restore rehearsal, UptimeRobot with a forced-failure alert test, keys into Bitwarden. | `docs/deploy.md` |
| 2026-09-03 | Dogfood fleet: every scheduled job on the maintainer's machine reports to VerifyRuns via a Supabase run table. A forced failure exposes that a job exiting 1 still PASSed. Heartbeat schedule windows with DST handling. | `docs/dogfood.md` |
| 2026-09-04 | `reported-failure` closes the gap found by dogfooding. Analytics removed, fonts self-hosted after a legal review. | PR #12, #13, #14 |
| 2026-09-05 | Alpha rehearsal against the deployed service. Cloudflare error 1042 on Worker-to-Worker fetch found and fixed with a compatibility flag. 13 live checks pass. | `docs/alpha-release.md` |
| 2026-09-08 | Client-readiness hardening merged (PR #16). Pivot decision. Marketing drafts deleted. | this file |

Counts worth having on screen: 163 commits in 20 days, 16 PRs, 227 test cases in 25 files
running inside real workerd against real D1, 22 OpenSpec items passing strict validation.

## The stack, and what each piece cost

| Layer | Tool | Cost | Note for the video |
|---|---|---|---|
| API runtime | Cloudflare Workers | $0 | Cron trigger every minute, lazy tick on traffic |
| Database | Cloudflare D1 (SQLite) | $0 | No cross-statement transactions. This shaped the whole concurrency design. |
| Frontend hosting | Cloudflare Pages | $0 | |
| Staging | Second Worker + D1 | $0 | Gates production in CI |
| Email alerts | Resend free tier | $0 | |
| Uptime monitor | UptimeRobot free | $0 | Forced-failure test verified the alert path |
| Dogfood run table | Supabase free | $0 | Row-level security on the allowlisted job names |
| Postgres test target | Neon free | $0 | Let's Encrypt TLS proven from the edge |
| CI/CD | GitHub Actions | $0 | Tests, staging migrate+deploy+smoke, then production, then Pages |
| Tests | vitest + `@cloudflare/vitest-pool-workers` | OSS | Per-file isolated D1 |
| Specs | OpenSpec | OSS | One folder per change, strict validation |
| Design system | Hand-written CSS + Tailwind, Outfit / Manrope / JetBrains Mono | OSS | Fonts self-hosted after legal review |
| Secrets | Bitwarden | $0 | Key custody documented |
| Builder | Emergent (MVP only), then Claude Code and Codex sessions | paid | The only non-free line item is the AI assistance |

Total infrastructure bill: $0. That is the experiment's constraint and it held.

## Episodes: long video segments that stand alone as shorts

Each row is a segment in the long video and a candidate short. Hooks are suggested lines, not facts; check durations against the timeline before saying them. The "hook" is the first
sentence of the short. The "post" column is the written version's angle.

| # | Segment | Hook for the short | Written post angle |
|---|---|---|---|
| 1 | The problem in one sentence | "Your automation said Done. Nobody checked." | The failure mode: silent success |
| 2 | MVP in five days on an AI app builder, then taking it back | "The builder got me to a demo. Getting *out* of the builder took a day." | What AI app builders give you and what they lock |
| 3 | The rename on launch day | "I renamed the product the day it worked." | Naming, and why RunProof lost |
| 4 | Fourteen commits in one day, and what OpenSpec did | "Every feature is a folder before it's code." | Spec-driven work with an agent |
| 5 | The $0 stack decision, and the same-day Cloudflare port | "I moved the whole backend to the edge in one afternoon. Here's what broke." | Render + Atlas vs Workers + D1 |
| 6 | D1 has no transactions | "My database can't do transactions. The app is still correct." | Predicated UPDATEs and claim shapes as a durability pattern |
| 7 | Two agents in one checkout | "Two AI sessions edited the same file. One commit ate the other's work." | The three rules in `AGENTS.md` |
| 8 | Seven PRs, each reviewed blind | "I don't let the agent that wrote the code review it." | The blind-review convention |
| 9 | Cloudflare refused my password hashing | "600,000 iterations. Cloudflare said no at 100,000." | PBKDF2 caps and graceful fallback |
| 10 | The forced failure that found a bug | "I made a job fail on purpose. It PASSed." | Dogfooding finds what tests don't |
| 11 | The restore rehearsal | "A backup you haven't restored is a hope." | Backup, restore, key custody on free tiers |
| 12 | Error 1042 in the alpha rehearsal | "Production couldn't talk to staging. Same account, same zone." | Worker-to-Worker fetch and compatibility flags |
| 13 | The pivot | "Three weeks in, I asked who would pay. I didn't like the answer." | Knowing when a product is a lab |
| 14 | What the lab is for now | "It's live, it's free, and it's where I try things." | Roadmap as experiment list |

Segments 1, 5, 6, 7, 9, 10 and 13 are the strongest standalone shorts. Segment 13 is the
thumbnail. Segments 6, 7 and 8 are the strongest written posts because they carry a reusable
pattern rather than a story.

## Assets that already exist

- `docs/media/forced-fail.gif`: a public status page flipping PASS to FAIL. Usable as-is.
- The live app at https://verifyruns.pages.dev and the API health endpoint.
- `openspec/CLAIMS.md`: the coordination board, readable on camera.
- `docs/deploy.md`, `docs/alpha-release.md`, `docs/dogfood.md`: primary sources with dates.
- The commit log itself. Scrolling `git log --reverse --date=short` is a shot.

## Decisions (2026-09-09)

- **Platform:** YouTube for the long video and all shorts. LinkedIn gets the written posts and
  two or three natively uploaded shorts (the pivot, the two-agents collision, the blind-review
  convention), with the YouTube link in the first comment.
- **Length:** 15 to 20 minutes. Eight segments make the long cut: 1 (the problem), 2 (Emergent
  MVP and taking it back), 5 (the $0 stack and the Cloudflare port), 6 (D1 has no transactions),
  7 (two agents in one checkout), 9 (the PBKDF2 cap), 10 (the forced failure that PASSed),
  13 (the pivot). The other six segments exist only as shorts and posts.
- **Repo layout:** hybrid. Experiments that extend VerifyRuns are OpenSpec changes in this repo.
  Unrelated experiments get their own repo and link back here.
- **PRD:** header rewritten to describe the lab; the original pitch survives in git history and
  in this file.
