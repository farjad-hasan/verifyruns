import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";

const SECTIONS = [
  {
    title: "Per Check",
    body: "Name, connector kind and config. Bearer tokens, Airtable tokens, Postgres connection strings and alert targets are encrypted at rest (AES-256-GCM) and only ever shown masked to their last four characters. Expectations, heartbeat cadence, the webhook secret, snooze state, and the last enqueued alert transition.",
  },
  {
    title: "Pending work",
    body: "Queued runs keep their ID, trigger, claimed count and supplied failure metadata until recorded. Pending notifications keep the Check name, original verdict message/time, encrypted channel targets and attempt results until accepted or cancelled by removing the targets or deleting the Check. The original run is retained while its notification is pending.",
  },
  {
    title: "Per run",
    body: "Timestamp, trigger, verdict, the diff message, and a fingerprint: record count, sample size, the previous count observation, an opaque destination-configuration hash, read-success and count-accuracy flags, field names, per-field empty rates, and a SHA-256 hash of the newest record. Also the count your workflow claimed, whether it reported failure, and its supplied error text (up to 500 characters), and per alert channel its kind, whether it delivered, and a short error on failure; a single service-wide count of failed deliveries is kept as a number only. No destination rows. No upstream response bodies.",
  },
  {
    title: "How long runs are kept",
    body: "Run rows are deleted once they are older than 90 days, except that every Check always keeps its newest 35 runs and its newest 30 PASS runs regardless of age, plus runs with pending notifications until resolved, so the comparison baseline and the 30-square timeline are never touched by retention. The sweep runs with the periodic tick; when the tick is not running, neither retention nor sample expiry happens.",
  },
  {
    title: "If you turn on “Store raw samples”",
    body: "Off by default. When on, each run also keeps the newest record, the five newest destination rows and up to 500 characters of an upstream error body, in a separate record the database deletes automatically about 30 days later. Turning it off stops new samples; existing ones expire on schedule.",
  },
  {
    title: "Your workflow",
    body: "We never see it. The only thing that reaches VerifyRuns is the one HTTP POST it sends to the webhook, and the body is read for a count, a boolean failed flag and an optional error message. Keep secrets and personal data out of that error message.",
  },
  {
    title: "Deleting",
    body: "Deleting a Check deletes its runs, samples and pending work. Delete account (the bin icon next to Sign out) removes your Checks, runs, samples, pricing interest, password-reset tokens, pending work and the account itself immediately — no soft delete, no retention.",
  },
  {
    title: "Public status pages",
    body: "Show the Check's name, connector kind and the last 30 verdicts with their messages. Workflow-supplied failure reasons are replaced by a fixed sentence. Never config, secrets, fingerprints or samples.",
  },
  {
    title: "Runs written before 2026-08-27",
    body: "Runs recorded by earlier builds may still hold raw newest-record data in the run itself. Delete the Check, or the account, to purge them; they are not migrated automatically.",
  },
];

export default function DataPage() {
  useTitle("What we store");
  return (
    <div className="rp-page">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 lg:px-10 pt-16 pb-24">
        <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Data</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">What we store.</h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-[65ch]">
          A watchdog that reads your database has to be careful about what it keeps. Here is the whole list, and every change to it ships with this page.
        </p>
        <p className="text-sm text-quiet mt-3 font-mono">Last updated 2026-09-07</p>
        <div className="mt-12 space-y-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="font-display text-xl mb-2">{s.title}</h2>
              <p className="text-zinc-400 leading-relaxed max-w-[65ch]">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-quiet mt-12 max-w-[65ch]">
          Self-hosting? Every environment variable and the network policy are documented in the repository's <code className="font-mono">docs/self-hosting.md</code>.
        </p>
      </div>
      <Footer />
    </div>
  );
}
