import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import { ArrowRight, ShieldCheck, Zap, Eye } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 rp-grid opacity-70 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 lg:px-10 pt-24 pb-24 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-medium mb-8 rp-fade">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Silent-failure watchdog for no-code automations
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight rp-fade" style={{ animationDelay: "60ms" }}>
            Your automation said <span className="text-zinc-500 line-through decoration-2 decoration-red-500/60">Done</span>.
            <br />
            RunProof checks if that&apos;s true.
          </h1>
          <p className="mt-8 text-lg text-zinc-400 max-w-2xl leading-relaxed rp-fade" style={{ animationDelay: "140ms" }}>
            n8n, Make and Zapier finish green while silently writing nothing — or the wrong thing —
            to your destination. RunProof re-reads the destination itself after every run and tells you
            when a &ldquo;successful&rdquo; workflow didn&apos;t actually land.
          </p>
          <div className="mt-10 flex items-center gap-3 rp-fade" style={{ animationDelay: "220ms" }}>
            <Link to="/signup" className="rp-btn-primary" data-testid="hero-signup-btn">
              Start free <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="rp-btn-ghost" data-testid="hero-login-btn">
              I have an account
            </Link>
          </div>

          {/* Timeline demo */}
          <div className="mt-20 rp-card p-6 sm:p-8 rp-fade" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Last 30 runs</p>
                <p className="font-display text-xl">airtable-orders-sync</p>
              </div>
              <span className="badge-pass">Pass</span>
            </div>
            <div className="flex items-center gap-1 tl-hero">
              {Array.from({ length: 30 }).map((_, i) => {
                const fail = [7, 18, 24].includes(i);
                return <div key={i} className={`tl-square ${fail ? "fail" : "pass"}`} />;
              })}
            </div>
            <p className="mt-5 text-sm text-zinc-500 font-mono">newest &rarr;</p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-[#18181B]">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-24">
          <p className="text-xs uppercase tracking-widest text-red-400 mb-3">The silent failure</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-6 max-w-3xl">
            Every monitoring tool watches the run.
            <br />
            <span className="text-zinc-500">Nobody watches the destination.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-5 mt-12">
            {[
              { title: "Zapier says ✓", body: "Task completed. 200 OK. All nodes green.", tag: "Reality" },
              { title: "Airtable says …", body: "Zero new rows. The upsert matched an existing record and silently no-op'd.", tag: "Truth" },
              { title: "You find out", body: "Three days later, when a customer emails asking where their invoice went.", tag: "Pain" },
            ].map((c) => (
              <div key={c.title} className="rp-card p-6">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">{c.tag}</p>
                <p className="font-display text-lg mb-2">{c.title}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#18181B] bg-[#0C0C0E]">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-24">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-14">Three steps. About four minutes.</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <ShieldCheck size={20} />, step: "01", title: "Create a Check", body: "Point RunProof at your destination — the GET url that returns your records. Add expectations like &ldquo;at least 1 new record per run&rdquo;." },
              { icon: <Zap size={20} />, step: "02", title: "Paste the webhook", body: "Add one HTTP Request node at the end of your workflow that POSTs to the RunProof webhook. That's the whole integration." },
              { icon: <Eye size={20} />, step: "03", title: "Get verdicts", body: "After every run, RunProof re-reads the destination, fingerprints it, and posts a PASS or FAIL with a human-readable diff." },
            ].map((s) => (
              <div key={s.step} className="rp-card p-8">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-6">
                  {s.icon}
                </div>
                <p className="font-mono text-xs text-zinc-500 mb-2">{s.step}</p>
                <p className="font-display text-xl mb-3">{s.title}</p>
                <p className="text-sm text-zinc-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: s.body }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#18181B]">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 py-24 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Stop trusting the green checkmark.
          </h2>
          <p className="mt-4 text-zinc-400 text-lg">Sign up free. Add your first check in under five minutes.</p>
          <div className="mt-10">
            <Link to="/signup" className="rp-btn-primary" data-testid="cta-signup-btn">
              Create your first check <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#18181B]">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8 text-sm text-zinc-500 flex justify-between">
          <span>RunProof</span>
          <span className="font-mono">v0.1</span>
        </div>
      </footer>
    </div>
  );
}
