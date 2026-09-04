# VerifyRuns: OPG alpha review

Prepared 2026-09-05 for the OPG fractional CTO and founders. These are independent reviewers, not yet committed pilot users. Do not present their feedback as customer validation.

## The positioning to use

**Your workflow finished. Check the destination.**

VerifyRuns independently reads destination counts and sampled fields after an automation runs. It alerts when expected net additions are missing, configured sampled fields fail, a workflow reports failure, or a scheduled run never arrives. Start with one sequential, append-only workflow into HTTP / JSON, Airtable or Postgres.

Thirty-second introduction: “A workflow can finish green without adding the records you expected. VerifyRuns reads the destination after the batch and checks its net growth and sampled fields. It gives the operator a sentence explaining a failure and can alert on a missing scheduled run. I want to find out whether that saves enough checking or incident time to become a paid product.”

Do not promise record reconciliation, duplicate detection, arbitrary value correctness, update verification, concurrent-writer attribution, private-network access, enterprise controls, agency administration, or a guaranteed setup time. A PASS covers the configured rules only. Paid packages are proposals; early access is free without a card.

## Review invitation — ready to send manually

Subject: Candid review of VerifyRuns — one workflow, one failure rehearsal

Hi,

I’m sharing an early version of VerifyRuns for an independent product and technical opinion. It checks destination counts and sampled fields after an automation runs, and alerts on failed checks or missing scheduled runs.

Could you spend 20–30 minutes trying the setup and a deliberate failure/recovery example? I’m particularly interested in where its evidence is insufficient, whether someone you work with already pays to solve this problem, and what would stop them connecting a real workflow.

Product: https://verifyruns.pages.dev
Setup and limits: https://verifyruns.pages.dev/setup

The current fit is a sequential, append-only sync with one writer. This is free early access. A blunt “this isn’t valuable enough” is as useful as a positive review. Please don’t send credentials in feedback.

Thanks,
Farjad

## Rehearsal before the meeting

Use a disposable destination and Check. Do not deliberately break a production workflow. The read must be complete and stable: no HTTP pagination, no rolling filter, no LIMIT inside a Postgres count query. Airtable must fit below the hosted count ceiling. Have permission to read the destination and edit its workflow.

1. Sign up, create a Check with minimum growth 1 and a meaningful required field. Turn retry off for a predictable immediate demo.
2. Add a channel, choose Send test, and confirm actual receipt. A provider accepting the request is not proof it arrived.
3. Before writing, Run Check now. The first count assertion says FAIL / Verification incomplete and establishes a baseline. This setup state does not alert by itself.
4. Insert three records, then POST to the secret webhook with JSON {"wrote":3}. Inspect the PASS and its count interval.
5. Insert nothing, then POST {"wrote":3}. Inspect the FAIL and confirm the alert.
6. Repeat the failed check: a previously accepted failure alert should not repeat for the same streak.
7. Insert three records and POST {"wrote":3}. Inspect PASS and confirm recovery alert.
8. Optionally remove a required field from the entire inspected sample in the disposable result. Show the field failure. This demonstrates sampled field presence, not validation of every record.
9. Enable the public link, open it logged out, then disable it and confirm the old link stops working. Public messages can expose field names; workflow-supplied failure reasons are hidden.
10. Show settings: edit destination, expectations and retry; explain that changing connection settings creates a fresh baseline. Delete the disposable Check after the session.

For heartbeats, configure a longer gap than the workflow normally needs, and select active hours if appropriate. Manual runs and retries also refresh this clock. An accelerated scheduler fixture is test evidence, not a demonstration of a production day having elapsed.

## Run the meeting

First five minutes: show the landing page and let the reviewer explain what they think it does, who needs it and what PASS proves. Record the wording before correcting misunderstandings.

Next ten minutes: let them create a Check without coaching. Record any intervention, confusing default, missing credential requirement or uncertain next step. Then run the failure/recovery rehearsal above.

Final ten minutes: ask about the last real incident, its consequences, who discovered it, and what they currently use. Ask whether aggregate counts would have caught it and whether the operator would trust an external service with read access. Ask for a concrete suitable workflow and its owner. Ask what spend it could replace or justify; a price-interest click alone is not willingness-to-pay evidence.

Record: reviewer role; incident and approximate frequency; current workaround; setup time and interventions; intended claim versus actual coverage; channel receipt; objections; named workflow/owner; agreed next action and date. Do not turn polite enthusiasm into a positive signal.

## What to decide afterwards

Continue the next validation cycle if at least two suitable workflow owners agree to connect a real recurring workflow, and at least one identifies a credible budget or avoided recurring work. Those are proposed operating gates, not market facts.

Narrow or reimagine the product if reviewers consistently need record identities, update verification or proof for clients. Validate that specific pain before building reconciliation or agency management. Stop this direction if owners with recent relevant incidents will neither connect a suitable workflow nor commit time to a pilot after follow-up. Do not add a feature list merely to avoid that conclusion.

OPG opinions can improve the thesis and introduce operators. They cannot establish retention, incident value or sellability without real use. Keep the next build budget focused on obstacles exposed by those trials.

## Evidence and repeatability

See [alpha-release.md](alpha-release.md) for the exact tested release and remaining external evidence. For the local HTTP rehearsal, run the local worker with migrations, a frontend build pointing to localhost:8787, and the following in separate terminals from the repository root:

~~~sh
node scripts/alpha-smoke.mjs serve
node scripts/alpha-smoke.mjs
~~~

The fixture serves a disposable destination on 8790 and the built frontend on 3100. The smoke uses a local-only API URL, creates its own account and deletes it in a finally block. Set ALPHA_TICK_SECRET to the local worker’s VR_TICK_SECRET; its fixture default is alpha-local-tick-only. Enable VR_ALLOW_PRIVATE_EGRESS=1 only in the local worker. Production and staging do not need that switch.
