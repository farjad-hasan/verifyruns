# VerifyRuns video — script, draft 1

Target: 15 to 20 minutes on YouTube. Eight segments from `docs/story.md`. Voiceover is written
to be spoken, about 2,700 words, which is roughly 17 minutes at a natural pace plus pauses for
the screen. Every claim traces to a file or commit named in the shot notes. Bracketed lines are
direction, not speech.

Style: first person, past tense for the story, present tense for the patterns. No hype. Say the
number, show the file. Each segment ends on a line that works as the last frame of a short.

---

## Cold open (0:00 to 0:45)

[Screen: the forced-fail GIF, `docs/media/forced-fail.gif`. A public status page flips from a
green PASS to a red FAIL. Hold on the FAIL sentence.]

Your automation said "Done." Nobody checked.

That sentence is why I spent three weeks building this. It went from nothing to a live product
in nine days. Then I spent two more weeks making it production grade. Tests inside a real
database, a staging environment, backups I actually restored, an uptime monitor I actually
tripped on purpose.

And then I asked the question I should have asked on day one. Who pays for this?

I didn't like the answer. So this video is about what I built, what it cost, what broke, and
why it's now a lab instead of a company. Total infrastructure bill: zero dollars. That part
held. Let me show you.

[Title card: VerifyRuns. Under it: a $0 web app, three weeks, one honest ending.]

---

## Segment 1: The problem (0:45 to 2:15)

[Screen: an n8n canvas with a workflow ending in a green checkmark. Then a spreadsheet or
Airtable base with an empty row where data should be.]

If you build workflows in n8n, Make or Zapier, you know the feeling. The run shows green. Every
node says success. And three days later someone asks why the orders from Tuesday never made it
into the sheet.

The workflow didn't lie. It sent the request and got a 200 back. But "the API accepted my
request" and "the data is in the destination" are two different facts, and no automation tool
checks the second one.

VerifyRuns checks the second one. After your workflow finishes, it sends one webhook to
VerifyRuns. VerifyRuns goes and reads the destination itself. The Airtable table, the Postgres
query, the JSON endpoint. It counts. It looks at the fields. It compares to the last thirty
good runs. And it posts a verdict.

[Screen: the README diff block.]

    FAIL — airtable-orders-sync
    Run reported success, but your workflow said it wrote 3 records; the destination
    gained 0, and the field `price` disappeared — it was present in the last 30 good runs.

That's the whole product. One sentence a human can act on, instead of a green checkmark that
means nothing.

[Beat.]

The idea is sound. I still think that. The question was never whether it works. Hold that
thought.

---

## Segment 2: Five days on an AI app builder, then taking it back (2:15 to 4:30)

[Screen: `git log --reverse --date=short | head`. The first commit, 2026-08-19. Then four
commits on 2026-08-24.]

I started on August 19th. Not in an editor. In Emergent, one of those AI app builders where
you describe the thing and it scaffolds a backend, a frontend and a database for you.

Five days later I had an MVP. FastAPI, MongoDB, a React frontend, working auth, working checks.
I renamed it the same day it worked. It was called RunProof. "VerifyRuns" says what it does; RunProof
sounded like something you'd sign. Four commits on one day, and one
of them is a rename. That's what launch day looks like when you're one person.

[Screen: the commit `dev: run VerifyRuns locally — drop the private Emergent package, pin ajv 8,
test against localhost`, 2026-08-27.]

Here's the part builders don't put in the demo video. Getting out took a day.

The frontend depended on a private package that only existed inside Emergent. The git config
was theirs. The cron setup lived in a hidden directory that assumed their runtime. None of it
was malicious. It's just that a builder's job is to get you to a demo fast, and the fastest
path is to lean on things that only exist in the builder.

[Screen: `git show python-backend-final --stat`, scrolling the `.emergent/` files.]

So on August 27th I made it run on my laptop with nothing but Node and Python. Dropped the
private package, pinned the one dependency it had been hiding, pointed tests at localhost.

What the builder gave me: five days to a working product, which I could not have done alone in
five days. What it cost me: one day of extraction, and a backend I was about to throw away
anyway.

Use the builder. Plan the exit before you start.

---

## Segment 3: The $0 stack, and the day I moved the backend to the edge (4:30 to 7:15)

[Screen: a table. Render free. MongoDB Atlas M0. cron-job.org. Cloudflare Pages. Every row
says $0.]

The constraint I set on day one was zero dollars of hosting. Not because I'm cheap. Because if
this thing didn't find customers, I didn't want a monthly bill reminding me.

On August 28th, just after midnight, I had a plan that worked. Render's free tier for the API.
MongoDB Atlas free tier. A free cron service to ping the worker every minute. Cloudflare Pages
for the frontend. I created the Atlas cluster in Singapore at quarter to one in the morning and
pinned Render to the same region.

[Screen: `git log` for 2026-08-28 with times. 00:09, 00:29, 00:45. Then a gap. Then 16:10.]

Then I slept on it, and by four in the afternoon I'd changed my mind.

Render's free tier sleeps after fifteen minutes. The first webhook after a quiet night would
take thirty seconds to wake the server. Atlas free tier is fine, but it's a Mongo cluster in
one region talking to a Python process in one region, and the whole product is "go read a
destination somewhere on the internet." That wants to run at the edge.

[Screen: the three commits at 16:10, 16:14, 16:15. Stage A, stage B, stage C.]

So I ported the whole backend to Cloudflare Workers with D1 as the database. TypeScript,
not Python. SQLite, not Mongo. Three stages. Auth and the check CRUD at API parity. Then the
verdict engine, the connectors, the alerts. Then everything time based.

[Screen: the commit at 19:30. `deploy: VerifyRuns live on Cloudflare — Worker + D1 + Pages`.]

Live at half past seven that evening. Same API contract, so the frontend didn't change.

The Python backend got a git tag, `python-backend-final`, and was deleted the same day.

[Screen: the stack table from `docs/story.md`. Cloudflare Workers, D1, Pages, a second Worker
and D1 for staging, Resend, UptimeRobot, Supabase, Neon, GitHub Actions. Every row $0.]

This is the stack that's still running. Every line is a free tier or open source. A cron
trigger runs every minute. A second Worker and database serve as staging, and staging gates
production in CI. Two hundred and twenty seven tests run inside the real Workers runtime
against a real D1 database, one isolated database per test file.

Zero dollars. Not "zero dollars for now." Zero dollars with staging, backups and monitoring.

---

## Segment 4: My database can't do transactions (7:15 to 9:45)

[Screen: `worker/src/tick.ts`, scroll to line 63.]

Here's the trade I made when I picked D1, and I want to show it properly because it shaped
everything after.

D1 is SQLite at the edge. It's fast, it's free, and it has no cross-statement transactions.
You can batch statements, but you cannot open a transaction, read something, think about it,
and write based on what you read. Between your read and your write, another copy of the
Worker may have done the same thing.

And this app is nothing but "read, think, write." A cron fires every minute. Traffic also
triggers a sweep. Both might notice the same heartbeat is overdue. Both might try to record
the same missed run and send the same alert. Twice.

[Screen: highlight line 63 and 64.]

    UPDATE checks SET next_heartbeat_due_at = ?
      WHERE id = ? AND next_heartbeat_due_at = ?
    if (!res.meta.changes) continue;

This is the pattern. Every write says what it expects the current value to be. If another
sweep already moved the due time, the WHERE clause doesn't match, zero rows change, and this
sweep walks away. No lock. No transaction. The row itself is the lock.

[Screen: line 129, the lease claim on `run_lease_until`.]

Same idea for queued runs. A sweep claims a check by writing a lease token, but only if the
lease is empty or expired. Whoever's UPDATE lands first owns the run. The others get zero
changes and move on.

[Screen: line 54, the NOT EXISTS insert.]

And for the heartbeat run itself, the INSERT carries a NOT EXISTS clause. If a run for this
window already exists, the insert is a no-op.

The rule I wrote in the project docs is one line. Durability comes from predicated UPDATEs
and claim shapes. Keep that discipline for anything concurrent.

You don't need transactions if every write is conditional on what you last saw. You need
discipline about never writing an unconditional UPDATE to a row that two things can touch.

---

## Segment 5: Two agents in one checkout (9:45 to 12:00)

[Screen: `AGENTS.md`, the first paragraph.]

I don't write most of this code by hand. I run Claude Code sessions, sometimes Codex, and I
review what they produce. Usually one session at a time.

On August 30th I ran two at once. Same checkout. One was doing a design pass across the
frontend. The other was hardening the API routes.

[Screen: the commit `routes: take back the publicCheck rewrite that was swept into 7e5eca9 by
file-level staging`.]

The routes session finished first and committed. It staged by file, `git add` on the routes
file. That file also contained the design session's half-finished rewrite of the public status
endpoint. The design session's work shipped inside someone else's commit, without its test,
under a commit message that didn't mention it.

Nobody's code was lost. But the suite went red, and I spent an hour figuring out which
session's change had broken what.

[Screen: the three rules in `AGENTS.md`.]

So the two sessions and I wrote the rules down, and they've held for every session since.

One. One agent, one change, in its own worktree. Not a branch in the same folder. A separate
directory on disk, so two sessions physically cannot stage each other's files.

Two. Stay inside your change's impact list. Every planned change has a proposal that lists the
files it will touch. If you need a file another open change owns, you're not parallel, you're
sequential. There's a claims table and an overlap table, and you check them before you start.

Three. Stage exact paths, pull before commit, one topic per commit. Never `git add -A` in a
tree someone else might share. If you find someone else's uncommitted work, leave it and say so.

[Screen: `openspec/CLAIMS.md`, the table. Owner column shows `claude/dogfood (Mac)`,
`codex/client-readiness`, `claude/design-audit (Mac)`.]

This is the board now. Every row is a session. You can see which machine, which branch, which
PR, and whether it's done. The rules cost me one collision and one hour. They've saved the same
collision at least a dozen times since.

Agents don't collide because they're bad at git. They collide because you didn't tell them
the other one exists.

---

## Segment 6: Cloudflare refused my password hashing (12:00 to 13:45)

[Screen: `worker/src/crypto.ts`, lines 137 to 151.]

Short one, because it's a single fact that tests can't catch.

Passwords are hashed with PBKDF2. The OWASP number for SHA-256 is six hundred thousand
iterations. I set six hundred thousand. Every test passed. Local workerd, the thing tests run
in, accepts six hundred thousand.

Cloudflare's production runtime doesn't. It refuses PBKDF2 above one hundred thousand
iterations. There's a workerd issue about it. Locally, fine. Deployed, every login throws.

[Screen: highlight `pbkdf2Capped` and the `console.warn` at line 151.]

I found this in a review before it shipped, not in production, and that's the only reason
it's a funny story. The fix is a retry. Try the configured count. If the runtime throws, retry
once at one hundred thousand, log a warning that says exactly what happened, and remember the
cap for the life of the isolate so you don't pay for the failed attempt on every login.

[Screen: `docs/security.md` or the memory note. "Verified live 2026-09-01: production refused
600k, fallback engaged, stored hashes record 100000."]

On September 1st I deployed and watched the log. Production refused six hundred thousand. The
fallback engaged. The stored hashes say one hundred thousand, and the iteration count is stored
per hash so when Cloudflare lifts the cap, the next login rehashes upward on its own.

The lesson isn't about PBKDF2. It's that a passing test suite is evidence about the test
runtime, not the production one. If a platform has a documented limit your tests can't
reproduce, the code has to survive hitting it.

---

## Segment 7: I made a job fail on purpose. It passed. (13:45 to 15:45)

[Screen: `docs/dogfood.md`, the first paragraph.]

By September 3rd I'd run out of features I trusted myself to prioritise. So I pointed the
product at my own life. Every scheduled job on my Mac got a check in VerifyRuns. A nightly search-index rebuild.
Morning and end-of-day briefs. An hourly sweep that only runs during working hours. A weekly
retention worklist. Seven jobs.

None of those jobs write anywhere a Cloudflare Worker can read. Local files, local SQLite. So
each job, on exit, appends one row to a small Supabase table, then tells VerifyRuns "I wrote
one." VerifyRuns reads the table back, expects one new row per run, and heartbeats when
nothing arrives.

[Screen: the fleet table in `docs/dogfood.md`.]

Then I did the thing you should always do with a monitoring tool. I broke a job on purpose.
Made a command exit with status one.

It passed.

[Beat. Screen: a green PASS square on the timeline.]

Of course it passed. The wrapper appended its row on exit, regardless of the exit code. The
row arrived. VerifyRuns counted one new row. One expected, one found. PASS. The product did
exactly what I told it to, and what I told it to was wrong.

[Screen: the `reported-failure` commit, 2026-09-04. `{"status":"failed"} in the webhook body is
a FAIL, alerted without a retry`.]

The fix took a day. The webhook body can now carry a failure. The wrapper sends the exit code
on any non-zero exit. That run is a FAIL with the exit code in the sentence, and it alerts
immediately, no thirty second retry, because a job that told you it failed isn't going to pass
on a second read.

Two hundred tests didn't find this. Ten minutes of using my own product did. Every check in
that fleet now has "Supabase fleet_runs" in its name, so nobody, including me, reads more into
a PASS than it actually proves.

---

## Segment 8: The pivot (15:45 to 18:15)

[Screen: `openspec/CLAIMS.md`, scrolling. Sixteen PRs. Then the pricing-tiers row: "deferred
(activation: ≥10 external live Checks)".]

Twenty days. A hundred and sixty three commits. Sixteen pull requests, each one reviewed by a
separate agent session that hadn't seen the code being written. A staging environment. A
restore rehearsal. A forced-failure test on the uptime monitor. Keys in a password manager.
An n8n node published to npm.

And a pricing page with a rule I wrote on day nine: don't build pricing until ten people
outside this house have a live check running.

That never happened.

[Screen: the five deleted marketing files in a git stash or a screenshot. Show HN. Product
Hunt. r/n8n. The n8n forum. An X thread.]

I wrote five launch posts. Show HN, Product Hunt, Reddit, the n8n forum, a thread. I never
posted any of them. I kept finding one more thing to harden first. And on September 8th I
admitted why.

The product works. The problem is real. But the person who builds n8n workflows can add a
verification step in n8n. It's one more node. And the person who'd pay for a dashboard already
pays Make or Zapier, and those show run history. There's a gap between those two people, and
I'm not sure it's wide enough to stand in.

[Screen: `docs/story.md`, the section "The pivot, stated plainly".]

So I did the honest thing. I deleted the launch posts. I rewrote the project doc so the first
paragraph says what this is now. And I kept the app running, because it costs nothing and it's
the best thing I've ever built.

What I actually made in three weeks wasn't a company. It was proof that one person, with an AI
app builder for the first five days and AI agents for the rest, can ship a real production
system on free tools. With the concurrency handled. With the security reviewed. With a
restore that works.

That's worth more to me as a thing I can show you than as a thing I could sell.

---

## Outro (18:15 to 19:00)

[Screen: the live app. Then `docs/story.md` open on the stack table.]

VerifyRuns is live. It's free. You can make a check, point it at an Airtable base, and watch it
catch a workflow that lied. The repo's public. Every decision in this video is a dated commit
you can read.

This is the lab now. Next experiments go in as episodes. Some extend this app. Some will be
their own repo. All of them stay on the zero dollar stack, because that constraint is the
interesting part.

If one of these segments was useful, the shorts are cut from this video, and the written
versions with the code go up on LinkedIn. Links below.

Your automation said "Done." Now you know how to check.

[End card.]

---

## Shot list summary

| Segment | Primary source on screen |
|---|---|
| Cold open | `docs/media/forced-fail.gif` |
| 1 | README diff block; an n8n canvas |
| 2 | `git log --reverse`; `git show python-backend-final --stat`; commit `dev: run VerifyRuns locally` |
| 3 | `git log` for 2026-08-28 with times; stack table in `docs/story.md` |
| 4 | `worker/src/tick.ts` lines 54, 63–64, 129 |
| 5 | `AGENTS.md` three rules; commit `routes: take back the publicCheck rewrite`; `openspec/CLAIMS.md` |
| 6 | `worker/src/crypto.ts` lines 137–151; `docs/security.md` |
| 7 | `docs/dogfood.md`; PR #12 commit |
| 8 | `openspec/CLAIMS.md`; `docs/story.md` pivot section |
| Outro | live app; `docs/story.md` stack table |

## Known gaps to fill before recording

- Segment 2: the rename reason is not recorded anywhere in the repo. The line given is a
  placeholder; say the real reason.
- Segment 8: the five marketing drafts are deleted and were never committed. Either recreate
  the file list as a screenshot or say "five drafts" without showing them.
- Timings are estimates at about 150 words per minute. Read it aloud once and adjust.
