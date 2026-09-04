import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";

export default function SetupPage() {
  useTitle("Setup guide");
  return <div className="rp-page"><Nav />
    <main className="max-w-3xl mx-auto px-6 lg:px-10 py-16 w-full" data-testid="setup-guide">
      <h1 className="font-display text-4xl font-semibold tracking-tight mb-5">Verify a destination, one Check at a time.</h1>
      <p className="text-lg text-zinc-400 leading-relaxed max-w-[65ch]">Start with a scheduled workflow that adds records to a stable destination. You need permission to read that destination and edit the workflow. Early access is free.</p>
      <section className="mt-10 space-y-4" data-testid="setup-coverage">
        <h2 className="font-display text-2xl">Choose a workflow the alpha can check</h2>
        <p className="text-zinc-400 leading-relaxed">Good fit: a sequential, append-only sync into an HTTP / JSON result, Airtable table or Postgres query. Keep one writer per monitored result set and send one webhook after the batch has finished committing.</p>
        <p className="text-zinc-400 leading-relaxed">A count check measures net additions between destination observations. It cannot identify which records arrived, detect duplicates reliably, validate arbitrary values, or distinguish updates from a no-op. Other writers, deletes and changing filters can distort the count. Do not use a paginated or rolling result as if it were a full-table count.</p>
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-2xl">1. Connect a destination</h2>
        <ul className="list-disc pl-5 space-y-3 text-zinc-400 leading-relaxed">
          <li><strong className="text-zinc-200">HTTP / JSON:</strong> a public GET URL returning a complete array, optional bearer token and path such as <code>data.records</code>. HTTP pagination is not followed. Responses are limited to 5 MB. Set a newest-record key such as <code>created_at</code>, or ensure the last array element is newest.</li>
          <li><strong className="text-zinc-200">Airtable:</strong> base ID, table and a personal access token with <code>data.records:read</code> for that base. An optional view must have stable membership. The hosted count ceiling is 4,000 records; a capped count cannot satisfy a growth check.</li>
          <li><strong className="text-zinc-200">Postgres:</strong> a publicly reachable database, publicly trusted TLS certificate and a read-only role. Use one SELECT or WITH query ordered newest first. VerifyRuns counts the full query and samples up to 100 rows. A LIMIT inside your query also limits the count.</li>
        </ul>
        <pre className="mono-block" data-testid="setup-postgres-example">SELECT id, email, created_at FROM orders ORDER BY created_at DESC</pre>
        <p className="text-sm text-quiet">Private-network destinations and private-CA database certificates are not supported by the hosted alpha. <Link to="/security" className="rp-inline">Read the security details</Link>.</p>
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-2xl">2. Set expectations and record a baseline</h2>
        <p className="text-zinc-400 leading-relaxed">Growth defaults to at least one new record. Choose zero only if additions are not required. Claimed mode requires <code>{'{"wrote": N}'}</code> on every webhook and checks for at least N net additions. Steady checks that the count stays unchanged; it does not compare values.</p>
        <p className="text-zinc-400 leading-relaxed">Before running the workflow, click <strong>Run Check now</strong>. For a growth or steady assertion, the first read says FAIL with “Verification incomplete” and records a baseline. This setup state does not send an alert by itself and is not evidence that a write failed. The next observation can evaluate the count change. Changing the destination configuration starts a fresh baseline.</p>
        <p className="text-zinc-400 leading-relaxed">Required fields must occur in the inspected sample. Non-empty checks fail for a missing field, or when it is empty in the newest record and a majority of the five newest. These rules do not validate every record. If a configured rule cannot run, the verdict is FAIL and explains why.</p>
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-2xl">3. Add the final webhook step</h2>
        <p className="text-zinc-400 leading-relaxed">Copy the secret webhook URL from your Check. POST after the destination write completes. For an insert-only batch, send the number of new records you expect. Attempted updates are not additions.</p>
        <pre className="mono-block" data-testid="setup-webhook-example">{'POST <your Check webhook URL>\nContent-Type: application/json\n\n{"wrote": 3}'}</pre>
        <ul className="list-disc pl-5 space-y-3 text-zinc-400 leading-relaxed">
          <li><strong>n8n:</strong> HTTP Request, POST, JSON body. <code>{'{{ $input.all().length }}'}</code> is suitable only when each input represents one new record. Use Execute Once or aggregate first. The optional <code>n8n-nodes-verifyruns</code> community node throws on FAIL.</li>
          <li><strong>Make:</strong> HTTP → Make a request, POST, application/json. Aggregate a batch before the request. Send its expected insert count.</li>
          <li><strong>Zapier:</strong> Webhooks by Zapier → POST, JSON payload. Send <code>wrote: 1</code> only when one new record is expected. Your Zapier plan must include Webhooks.</li>
        </ul>
        <p className="text-zinc-400 leading-relaxed">The ordinary webhook returns a JSON verdict. HTTP 200 means the request was handled; inspect <code>verdict</code> for PASS or FAIL. To turn an n8n execution red, route FAIL through an IF node to Stop and Error. With <code>?wait=0</code>, the API returns 202 and queues verification for the scheduler; that response is not a verdict.</p>
        <p className="text-zinc-400 leading-relaxed">Your error path can POST <code>{'{"failed": true, "error": "Insert step failed"}'}</code>. Keep that message free of secrets and personal data. It is stored and included in private alerts; the public status page hides your supplied reason.</p>
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-2xl">4. Test alerts, failure and recovery</h2>
        <p className="text-zinc-400 leading-relaxed">Add Slack, Discord or email, then click <strong>Send test</strong>. Provider acceptance is not proof of inbox delivery: confirm receipt. With no channel, failures appear only in VerifyRuns.</p>
        <p className="text-zinc-400 leading-relaxed">Use a disposable workflow for the rehearsal. Establish a baseline; insert records and send the matching claim for PASS. Then skip an insert and send a positive claim for FAIL. Restore the insert and repeat for recovery. Confirm both alerts. Turn retry off for an immediate rehearsal; otherwise a retry is due after 30 seconds and runs on the next scheduler tick.</p>
        <p className="text-zinc-400 leading-relaxed">For scheduled workflows, set a heartbeat longer than the normal gap. Optional active hours and weekdays count only time inside that window. Manual reads and retries also refresh the heartbeat, so stop manual checks when testing a missing workflow run.</p>
      </section>
      <section className="mt-10 space-y-4">
        <h2 className="font-display text-2xl">Understand the verdict</h2>
        <p className="text-zinc-400 leading-relaxed"><strong>PASS:</strong> the configured checks were evaluated and met. <strong>FAIL:</strong> a rule failed, the workflow reported failure, an expected run was missing, or a configured check could not be evaluated. Read the sentence for the distinction.</p>
        <p className="text-zinc-400 leading-relaxed">Public status links are optional and readable by anyone who has the link. They reveal the Check name, verdicts and messages, but not destination credentials or raw samples. Accounts are single-user; public links are not team administration.</p>
        <p className="text-zinc-400 leading-relaxed">Need help choosing a suitable workflow? <a className="rp-inline" href="mailto:farjad.developer@gmail.com?subject=VerifyRuns%20alpha%20setup" data-testid="setup-contact">Email Farjad</a>. Describe the workflow; do not email credentials.</p>
      </section>
      <Link to="/checks/new" className="rp-btn-primary mt-10" data-testid="setup-create-check">Create a Check</Link>
    </main><Footer /></div>;
}
