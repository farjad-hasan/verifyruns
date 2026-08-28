import { Link } from "react-router-dom";
import Nav from "../components/Nav";

const POSTURE = [
  { title: "Passwords and sessions", body: "Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, per-user salt). Sessions are signed JWTs that expire after 7 days; there is no refresh token. Password reset sends a one-time link that works for an hour; only a SHA-256 of the token is stored, and a newer request cancels older links." },
  { title: "Secrets at rest", body: "Bearer tokens, Airtable tokens, Postgres connection strings and alert-channel targets are encrypted with AES-256-GCM under a key that lives only in the server's secret store. The API never returns them beyond their last four characters." },
  { title: "Where the server will connect", body: "Destinations must be public addresses — loopback, private, link-local and cloud-metadata addresses are refused when a Check is saved and again before every read. Redirects are not followed; responses are capped at 5 MB and 20 s. Postgres connections use TLS unless the connection string says sslmode=disable, and never downgrade on their own. On the hosted build the database's certificate must be publicly trusted." },
  { title: "Read-only by construction", body: "The Postgres connector accepts a single SELECT or WITH statement, wraps it as a subquery, and sets the session read-only before running it. Use a read-only database role anyway." },
  { title: "What we keep", body: "Fingerprints and a hash of the newest record, not rows. Raw samples are opt-in per Check and expire after about 30 days. The full list is on the What we store page." },
  { title: "Rate limits", body: "Sign-up and login per address, webhooks per secret, Check creation per account. They are enforced per server instance, so treat them as friction rather than a guarantee." },
];

const GAPS = [
  "No email verification or account lockout yet.",
  "Rate limits are per instance, not global.",
  "Email alerts are off until the operator configures a sending provider.",
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 lg:px-10 pt-16 pb-24">
        <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Security</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">How VerifyRuns is built.</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          A watchdog holds credentials to the systems it watches. This page says what protects them, and what is still open — true as of August 2026, updated with every change.
        </p>
        <div className="mt-12 space-y-8">
          {POSTURE.map((s) => (
            <div key={s.title}>
              <p className="font-display text-xl mb-2">{s.title}</p>
              <p className="text-zinc-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <p className="font-display text-xl mb-2">Known gaps</p>
          <ul className="list-disc pl-5 text-zinc-400 leading-relaxed space-y-1">
            {GAPS.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
        <div className="mt-12 rounded-md border border-[#27272A] bg-[#0F0F11] p-5">
          <p className="font-display text-lg mb-1">Reporting a vulnerability</p>
          <p className="text-zinc-400 leading-relaxed">
            Email <a className="underline underline-offset-4 hover:text-zinc-300" href="mailto:farjad.developer@gmail.com?subject=VerifyRuns%20security">farjad.developer@gmail.com</a> with “VerifyRuns security” in the subject. Please don't open a public issue for anything exploitable. You will hear back within a few days.
          </p>
        </div>
        <p className="text-sm text-zinc-500 mt-12">
          See also <Link to="/data" className="underline underline-offset-4 hover:text-zinc-300">What we store</Link> and <Link to="/pricing" className="underline underline-offset-4 hover:text-zinc-300">Pricing</Link>. Self-hosters: <code className="font-mono">docs/security.md</code> in the repository is the canonical version.
        </p>
      </div>
    </div>
  );
}
