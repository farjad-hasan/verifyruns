import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";

const POSTURE = [
  { title: "Passwords and sessions", body: "Passwords are hashed with PBKDF2-SHA256 with a per-user salt at 600,000 iterations where the runtime allows it; Cloudflare currently caps PBKDF2 at 100,000, so that is the effective strength on the hosted build, and each hash upgrades transparently on the next login once the cap lifts. Login performs a dummy password check for unknown emails; older password hashes can have different costs during an upgrade. Sessions are signed JWTs that expire after 7 days with no refresh token; a password reset invalidates every previously issued session, including a stolen one. Reset sends a one-time link that works for an hour; only a SHA-256 of the token is stored, and a newer request cancels older links." },
  { title: "Secrets at rest", body: "Bearer tokens, Airtable tokens, Postgres connection strings and alert-channel targets are encrypted with AES-256-GCM under a key that lives only in the server's secret store. The API never returns them beyond their last four characters." },
  { title: "Where the server will connect", body: "Destinations must be public addresses — loopback, private, link-local and cloud-metadata addresses are refused when a Check is saved and again before every read. HTTP and Airtable redirects are not followed. Each HTTP response or Airtable page is capped at 5 MB with a 20-second request timeout; multi-page reads can take longer overall. Postgres connections use TLS unless the connection string says sslmode=disable, and never downgrade on their own. On the hosted build the database's certificate must be publicly trusted." },
  { title: "Read-only by construction", body: "The Postgres connector accepts a single SELECT or WITH statement, wraps it as a subquery, and sets the session read-only before running it. Use a read-only database role anyway." },
  { title: "What we keep", body: "Fingerprints and a hash of the newest record, not rows. Raw samples are opt-in per Check and expire after about 30 days. The full list is on the What we store page." },
  { title: "Rate limits", body: "Sign-up and login per address, webhooks per secret, Check creation per account. The address is the one Cloudflare sets on the request, never a client-supplied forwarding header. Limits are enforced per server instance, so treat them as friction rather than a guarantee." },
  { title: "Alert delivery", body: "VerifyRuns attempts alerts on the first failure in a streak and on recovery. Provider acceptance does not prove receipt: if every channel fails, the streak is un-claimed so the next run alerts again; each failed delivery is recorded on the run and counted in a service-wide number that holds no targets or message bodies. Alert webhooks never follow redirects." },
  { title: "Headers", body: "Every API response carries HSTS, nosniff, a no-referrer policy and no-store caching. The site serves a Content-Security-Policy that runs scripts from its own origin only, connects only to itself and the API, and refuses framing — the backstop for the session token living in local storage." },
];

const GAPS = [
  "No email verification or account lockout yet.",
  "Rate limits are per instance, not global.",
  "The session token lives in local storage, readable by any script that runs on the page; the CSP is the mitigation and an httpOnly cookie the upgrade.",
];

export default function SecurityPage() {
  useTitle("Security");
  return (
    <div className="rp-page">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 lg:px-10 pt-16 pb-24">
        <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Security</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">How VerifyRuns is built.</h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-[65ch]">
          A watchdog holds credentials to the systems it watches. This page says what protects them and what is still open; it is updated with every change.
        </p>
        <p className="text-sm text-quiet mt-3 font-mono">Last updated 2026-09-05</p>
        <div className="mt-12 space-y-8">
          {POSTURE.map((s) => (
            <div key={s.title}>
              <h2 className="font-display text-xl mb-2">{s.title}</h2>
              <p className="text-zinc-400 leading-relaxed max-w-[65ch]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <h2 className="font-display text-xl mb-2">Known gaps</h2>
          <ul className="list-disc pl-5 text-zinc-400 leading-relaxed space-y-1">
            {GAPS.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
        <div className="mt-12 rounded-md border border-hairline bg-ink-alt p-5">
          <h2 className="font-display text-lg mb-1">Reporting a vulnerability</h2>
          <p className="text-zinc-400 leading-relaxed max-w-[65ch]">
            Email <a className="rp-inline" href="mailto:farjad.developer@gmail.com?subject=VerifyRuns%20security">farjad.developer@gmail.com</a> with “VerifyRuns security” in the subject. Please don't open a public issue for anything exploitable. You will hear back within a few days.
          </p>
        </div>
        <p className="text-sm text-quiet mt-12">
          Self-hosters: <code className="font-mono">docs/security.md</code> in the repository is the canonical version.
        </p>
      </div>
      <Footer />
    </div>
  );
}
