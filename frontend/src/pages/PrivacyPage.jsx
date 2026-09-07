import { Link } from "react-router-dom";
import LegalPage from "./LegalPage";

const MAIL = <a className="rp-inline" href="mailto:farjad.developer@gmail.com?subject=VerifyRuns%20privacy">farjad.developer@gmail.com</a>;

const SECTIONS = [
  { title: "Who runs VerifyRuns", paras: [<>VerifyRuns is operated by Farjad Hasan, an individual developer, from Pakistan. Questions and requests about your data go to {MAIL}.</>] },
  {
    title: "What we collect and why",
    paras: ["Everything below exists to do one job: re-read a destination your automation wrote to and tell you whether it really changed."],
    list: [
      <><strong className="text-zinc-300">Account:</strong> your email address and a salted PBKDF2 hash of your password, so you can log in. Passwords are hashed before storage.</>,
      <><strong className="text-zinc-300">Checks:</strong> the name, destination and expectations you configure. Bearer tokens, Airtable tokens, Postgres connection strings and alert targets (Slack/Discord webhook URLs, email addresses) are encrypted with AES-256-GCM before they are stored and are only ever shown back masked to the last four characters. They are used solely to read the destination and to deliver your alerts.</>,
      <><strong className="text-zinc-300">Runs:</strong> per run, a timestamp, the verdict, the diff sentence, the count your workflow claimed, any reported failure and supplied error text (up to 500 characters), delivery outcomes, and a fingerprint of the destination — record count, its previous observation, count-accuracy flags, an opaque destination-configuration hash, field names, per-field empty rates and a SHA-256 hash of the newest record. Not the rows. See <Link className="rp-inline" to="/data">What we store</Link> for the exact list.</>,
      <><strong className="text-zinc-300">Raw samples, only if you turn them on:</strong> up to five sampled destination records and up to 500 characters of an upstream error, kept about 30 days and then deleted automatically.</>,
      <><strong className="text-zinc-300">Pending work:</strong> queued run metadata until recorded; notification messages, encrypted targets and attempt results until accepted or cancelled by removing the targets or deleting the Check. Their original runs remain while pending.</>,
      <><strong className="text-zinc-300">Pricing interest:</strong> if you click a plan on the pricing page, the plan and any note you type, with your email.</>,
      <><strong className="text-zinc-300">Password resets:</strong> a hash of the one-time token, for one hour.</>,
      <><strong className="text-zinc-300">Not stored:</strong> The application uses IP addresses in memory for rate limiting; hosting-provider request logs may include connection metadata. There are no analytics or advertising trackers and no cookies; your session token lives in your browser's local storage.</>,
    ],
  },
  {
    title: "Your destinations",
    paras: ["When a Check runs, VerifyRuns connects to the destination you configured — an HTTP endpoint, an Airtable base or a Postgres database — using the credentials you gave it, reads enough to count records and look at the newest ones, and keeps only the fingerprint described above. Postgres sessions are opened read-only. Destinations must be publicly reachable; the service refuses private and internal addresses."],
  },
  {
    title: "Who else touches the data",
    paras: ["Cloudflare hosts the service and Resend sends email. Configured Slack or Discord webhooks receive alert text through the destination you choose. Nothing is sold or shared for advertising."],
    list: [
      <><strong className="text-zinc-300">Cloudflare</strong> hosts the application, the API and the database (Workers, Pages and D1), and processes operational request and error logs according to the hosting configuration.</>,
      <><strong className="text-zinc-300">Resend</strong> sends password-reset emails and email alerts, and therefore sees the recipient address and the alert text.</>,
    ],
  },
  {
    title: "How long we keep it",
    list: [
      "Account and Checks: until you delete them. Runs: 90 days, retaining at least the newest 35 runs and newest 30 PASS runs per Check regardless of age, plus runs with pending notifications until resolved; deleting a Check or account removes them.",
      "Raw samples: about 30 days from the run, removed by the periodic cleanup task.",
      "Password-reset tokens: one hour, or until used.",
      "Operational logs: retained according to the configured Cloudflare logging service.",
    ],
    paras: [],
  },
  {
    title: "Deleting and exporting",
    paras: [<>Delete account (the bin icon next to Sign out) removes your Checks, runs, samples, pricing interest, reset tokens, pending work and the account itself immediately — no soft delete, no retention window. Deleting a Check removes its runs, samples and pending work. For a copy of what we hold about you, email {MAIL} from the account address.</>],
  },
  {
    title: "If something goes wrong",
    paras: [<>If we learn that stored credentials or account data were exposed, we will email affected accounts within 72 hours with what happened and what to rotate. Security details and the disclosure address are on the <Link className="rp-inline" to="/security">Security</Link> page.</>],
  },
  {
    title: "Changes",
    paras: ["This policy changes when the product does. The date at the top moves and material changes are announced by email to account holders before they take effect."],
  },
];

export default function PrivacyPage() {
  return <LegalPage eyebrow="Privacy" title="Privacy policy." intro="Short, because the product stores little. This page says what VerifyRuns keeps about you and your destinations, who else touches it, and how to make it go away." updated="2026-09-07" sections={SECTIONS} />;
}
