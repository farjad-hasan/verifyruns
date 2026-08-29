import { useState } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import { ArrowRight, ShieldCheck, Zap, Eye } from "lucide-react";

const HOOK = "https://<your-host>/api/hook/<secret>";

const SNIPPETS = {
  n8n: {
    label: "n8n",
    lines: [
      "HTTP Request node — last step of the workflow",
      "Method: POST",
      `URL: ${HOOK}?wait=30`,
      "Body (JSON): { \"wrote\": {{ $input.all().length }} }",
    ],
    note: "Or install the VerifyRuns community node: one drag, and a FAIL turns the execution red.",
  },
  make: {
    label: "Make",
    lines: [
      "HTTP → Make a request — last module in the scenario",
      "Method: POST · Body type: Raw · Content type: JSON",
      `URL: ${HOOK}`,
      "Request content: { \"wrote\": 1 }",
    ],
    note: "Writing several rows per run? Put an Array aggregator before it and send its length.",
  },
  zapier: {
    label: "Zapier",
    lines: [
      "Webhooks by Zapier → POST — last action of the Zap",
      `URL: ${HOOK}`,
      "Payload type: json",
      "Data: wrote = 1",
    ],
    note: "Zapier alerts tell you when a Zap errors. This tells you when it succeeds and lands nothing.",
  },
};

function SetupTabs() {
  const [tab, setTab] = useState("n8n");
  const s = SNIPPETS[tab];
  return (
    <div className="rp-card p-6 sm:p-8" data-testid="setup-tabs">
      <div className="flex gap-2 mb-6">
        {Object.entries(SNIPPETS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border ${tab === k ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-hairline text-zinc-400 hover:text-zinc-200"}`}
            data-testid={`setup-tab-${k}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="mono-block whitespace-pre-wrap break-words text-xs sm:text-sm">{s.lines.join("\n")}</div>
      <p className="text-sm text-quiet mt-4 max-w-[65ch]">{s.note}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 rp-grid opacity-70 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 lg:px-10 pt-20 pb-20 relative grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-medium mb-8 rp-fade">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Destination watchdog for n8n, Make and Zapier
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.05] tracking-tight rp-fade" style={{ animationDelay: "60ms" }}>
              Your automation said <span className="text-quiet line-through decoration-2 decoration-red-500/60">Done</span>.
              <br />
              VerifyRuns checks if that&apos;s true.
            </h1>
            <p className="mt-8 text-lg text-zinc-400 max-w-xl leading-relaxed rp-fade" style={{ animationDelay: "140ms" }}>
              Workflows finish green while writing nothing — or the wrong thing — to the destination. Every monitor watches the run.
              VerifyRuns re-reads the destination after each one and says, in a sentence, what actually landed.
            </p>
            <div className="mt-10 flex items-center gap-3 rp-fade" style={{ animationDelay: "220ms" }}>
              <Link to="/signup" className="rp-btn-primary" data-testid="hero-signup-btn">
                Start free <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="rp-btn-ghost" data-testid="hero-login-btn">
                I have an account
              </Link>
            </div>
            <p className="mt-4 text-xs text-quiet font-mono">Early access · everything free · no card</p>
          </div>

          {/* The product is the sentence, so the sentence is the hero */}
          <div className="rp-fade min-w-0" style={{ animationDelay: "300ms" }} data-testid="hero-fail-card">
            <div className="rp-card p-6 sm:p-7 border-red-500/30">
              <div className="flex items-center justify-between mb-4">
                <span className="badge-fail">Fail</span>
                <span className="font-mono text-xs text-quiet">airtable-orders-sync · webhook</span>
              </div>
              <p className="text-zinc-100 leading-relaxed">
                Run reported success, but your workflow said it wrote 3 records; the destination gained 0, and the field{" "}
                <code className="font-mono text-zinc-100">price</code> disappeared — it was present in the last 30 good runs.
              </p>
              <div className="overflow-x-auto mt-6 tl-scroller" aria-hidden="true">
                <div className="flex items-center gap-1 w-max ml-auto tl-hero">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className={`tl-square ${i === 29 ? "fail" : "pass"}`} />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-quiet font-mono">alerted: slack ✓ · discord ✓</p>
            </div>
            <p className="mt-3 text-xs text-quiet max-w-[65ch]">A real verdict, word for word. No score, no model — deterministic checks you can read.</p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-raised">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
          <p className="text-xs uppercase tracking-widest text-red-400 mb-3">The silent failure</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-6 max-w-3xl">
            Every monitoring tool watches the run.
            <br />
            <span className="text-quiet">Nobody watches the destination.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {[
              { title: "Zapier says ✓", body: "Task completed. 200 OK. All nodes green.", tag: "Reality" },
              { title: "Airtable says …", body: "Zero new rows. The upsert matched an existing record and silently no-op'd.", tag: "Truth" },
              { title: "You find out", body: "Three days later, when a customer emails asking where their invoice went.", tag: "Pain" },
            ].map((c) => (
              <div key={c.title} className="rp-card p-6">
                <p className="text-[11px] uppercase tracking-widest text-quiet mb-3">{c.tag}</p>
                <p className="font-display text-lg mb-2">{c.title}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-t border-raised bg-ink-alt">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20 grid md:grid-cols-2 gap-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Who this is for</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Agencies at client #21.<br /><span className="text-quiet">Operators whose syncs touch money.</span></h2>
          </div>
          <div className="space-y-5 text-zinc-400 leading-relaxed max-w-[65ch]">
            <p>
              If you run automations for other people, "it ran" is not an answer you can give a client. VerifyRuns gives you the sentence and a public status page you can hand over.
            </p>
            <p>
              If your own workflow moves orders, invoices or CRM records, a green run that wrote nothing costs real money before anyone notices. One HTTP call at the end of the workflow, and it can't happen quietly.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-raised">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-12">Three steps. About four minutes.</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <ShieldCheck size={20} />, title: "Create a Check", body: "Point VerifyRuns at your destination — an HTTP endpoint, an Airtable table, a read-only Postgres query. Say what a good run looks like: growth, required fields, a heartbeat." },
              { icon: <Zap size={20} />, title: "Paste the webhook", body: "One HTTP Request node at the end of your workflow. Optionally send {\"wrote\": N} and the verdict reconciles your count against the destination." },
              { icon: <Eye size={20} />, title: "Get verdicts", body: "PASS or FAIL with a sentence. Slack, Discord or email on the first FAIL and again on recovery — never one message per red run." },
            ].map((s) => (
              <div key={s.title} className="rp-card p-8">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-6">
                  {s.icon}
                </div>
                <p className="font-display text-xl mb-3">{s.title}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Set up in your tool */}
      <section className="border-t border-raised bg-ink-alt">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Set up in your tool</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-10">One node. Copy, paste, done.</h2>
          <SetupTabs />
        </div>
      </section>

      {/* Receipts */}
      <section className="border-t border-raised">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 py-20">
          <p className="text-xs uppercase tracking-widest text-quiet mb-3">Why this exists</p>
          <p className="font-display text-2xl sm:text-3xl leading-snug tracking-tight">
            One of my own scheduled jobs hit a lock, exited 0, and recorded nothing. The only evidence was a single line in a log I wasn't reading. The scheduler was happy. The output was missing.
          </p>
          <p className="mt-6 text-zinc-400 leading-relaxed max-w-[65ch]">
            I built the check my own agents needed: read the thing that was supposed to change, and say whether it did. Then I made it work for everyone else's workflows.
          </p>
          <p className="mt-3 text-sm text-quiet font-mono">— Farjad Hasan</p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-raised">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 py-20 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Stop trusting the green checkmark.</h2>
          <p className="mt-4 text-zinc-400 text-lg max-w-[65ch] mx-auto">Free during early access. First check in under five minutes.</p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link to="/signup" className="rp-btn-primary" data-testid="cta-signup-btn">
              Create your first check <ArrowRight size={16} />
            </Link>
            <Link to="/pricing" className="rp-btn-ghost" data-testid="cta-pricing-link">Pricing</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-raised">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8 text-sm text-quiet flex flex-wrap items-center justify-between gap-4">
          <span>VerifyRuns</span>
          <div className="flex items-center gap-5">
            <Link to="/pricing" className="hover:text-zinc-300" data-testid="footer-pricing">Pricing</Link>
            <Link to="/data" className="hover:text-zinc-300" data-testid="footer-data">What we store</Link>
            <Link to="/security" className="hover:text-zinc-300" data-testid="footer-security">Security</Link>
            <Link to="/privacy" className="hover:text-zinc-300" data-testid="footer-privacy">Privacy</Link>
            <Link to="/terms" className="hover:text-zinc-300" data-testid="footer-terms">Terms</Link>
            <span className="font-mono">v0.2</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
