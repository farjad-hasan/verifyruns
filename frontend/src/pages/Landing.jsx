import { useState } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";
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
    note: "Or install the community node (n8n-nodes-verifyruns, Settings → Community Nodes): one drag, and a FAIL turns the execution red.",
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
  useTitle(null); // the marketing base title
  return (
    <div className="rp-page">
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
              Your workflow finished.
              <br />
              Check the destination.
            </h1>
            <p className="mt-8 text-lg text-zinc-400 max-w-xl leading-relaxed rp-fade" style={{ animationDelay: "140ms" }}>
              A green run can still leave missing output. VerifyRuns independently reads your destination and checks record growth and sampled fields.
              Get a plain-English alert when a configured check fails or cannot be verified.
            </p>
            <div className="mt-10 flex items-center gap-3 rp-fade" style={{ animationDelay: "220ms" }}>
              <Link to="/signup" className="rp-btn-primary" data-testid="hero-signup-btn">
                Start free <ArrowRight size={16} />
              </Link>
              <Link to="/setup" className="rp-btn-ghost" data-testid="hero-setup-btn">
                Read the setup guide
              </Link>
            </div>
            <p className="mt-4 text-xs text-quiet font-mono">Free early access · no card</p>
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
              <p className="mt-3 text-xs text-quiet font-mono">Example: failure notification accepted by Slack</p>
            </div>
            <p className="mt-3 text-xs text-quiet max-w-[65ch]">Example verdict from the deterministic rules. No model or score.</p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-raised">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
          <p className="text-xs uppercase tracking-widest text-red-400 mb-3">The silent failure</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-6 max-w-3xl">
            A successful run is one signal.
            <br />
            <span className="text-quiet">Check the output too.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {[
              { title: "Zapier says ✓", body: "Task completed. 200 OK. All nodes green.", tag: "Reality" },
              { title: "Airtable says …", body: "Zero new rows, even though this insert-only batch expected three.", tag: "Truth" },
              { title: "You find out", body: "A missing record can go unnoticed until a customer asks about it.", tag: "Pain" },
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
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">For the person maintaining the sync.<br /><span className="text-quiet">Before someone asks where the output went.</span></h2>
          </div>
          <div className="space-y-5 text-zinc-400 leading-relaxed max-w-[65ch]">
            <p>
              Start with a scheduled, append-only sync into HTTP / JSON, Airtable or Postgres. Set the expected additions and fields, then receive a verdict after each completed batch.
            </p>
            <p>
              Built for operators and automation consultants maintaining these workflows. Aggregate checks do not verify individual record identities or arbitrary values. Updates, other writers and rolling result sets need a different verification approach.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-raised">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-12">Connect. Establish a baseline. Verify.</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <ShieldCheck size={20} />, title: "Create a Check", body: "Connect a supported destination with read-only access. Choose count and field expectations, then run a first read to establish the baseline." },
              { icon: <Zap size={20} />, title: "Paste the webhook", body: "POST after the batch commits. Send {\"wrote\": N} to require at least N net additions since the previous destination observation." },
              { icon: <Eye size={20} />, title: "Get verdicts", body: "Read the PASS or FAIL sentence. Configure and test Slack, Discord or email delivery. Add a heartbeat to detect missing runs." },
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
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-10">One HTTP step after the write.</h2>
          <SetupTabs />
          <p className="text-sm text-quiet mt-4">Use an input count only when every item represents one expected new record. Establish a baseline first and send one webhook per completed batch. <Link to="/setup" className="rp-inline">Full setup and limits</Link>.</p>
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
            I built a destination check for my own jobs. This alpha makes those count and field checks available to other automation operators. I’m looking for real workflows and candid feedback.
          </p>
          <p className="mt-3 text-sm text-quiet font-mono">— Farjad Hasan</p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-raised">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 py-20 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Give your next sync a second check.</h2>
          <p className="mt-4 text-zinc-400 text-lg max-w-[65ch] mx-auto">Free during early access. Start with one suitable workflow and test its failure path.</p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link to="/signup" className="rp-btn-primary" data-testid="cta-signup-btn">
              Create your first Check <ArrowRight size={16} />
            </Link>
            <Link to="/pricing" className="rp-btn-ghost" data-testid="cta-pricing-link">Pricing</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
