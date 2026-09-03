import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";

const SECTIONS = [
  {
    title: "Per Check",
    body: "Name, connector kind and config. Bearer tokens, Airtable tokens, Postgres connection strings and alert targets are encrypted at rest (AES-256-GCM) and only ever shown masked to their last four characters. Expectations, heartbeat cadence, the webhook secret, snooze state.",
  },
  {
    title: "Per run",
    body: "Timestamp, trigger, verdict, the diff message, and a fingerprint: record count, sample size, field names, per-field empty rates, and a SHA-256 hash of the newest record — enough to tell changed from unchanged, not enough to rebuild the row. No destination rows. No upstream response bodies.",
  },
  {
    title: "If you turn on “Store raw samples”",
    body: "Off by default. When on, each run also keeps the newest five destination rows and up to 500 characters of an upstream error body, in a separate record the database deletes automatically about 30 days later.",
  },
  {
    title: "Your workflow",
    body: "We never see it. The only thing that reaches VerifyRuns is the one HTTP POST it sends to the webhook, and the body is read for a single integer.",
  },
  {
    title: "Deleting",
    body: "Deleting a Check deletes its runs and samples. Delete account (the bin icon next to Sign out) removes your Checks, runs, samples, pricing interest, password-reset tokens and the account itself immediately — no soft delete, no retention.",
  },
  {
    title: "Public status pages",
    body: "Show the Check's name, connector kind and the last 30 verdicts with their messages. Never config, secrets, fingerprints or samples.",
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
        <p className="text-sm text-quiet mt-3 font-mono">Last updated 2026-08-31</p>
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
