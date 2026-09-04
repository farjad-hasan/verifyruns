import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import useTitle from "../lib/useTitle";
import { Check as CheckIcon } from "lucide-react";

export default function Pricing() {
  useTitle("Pricing");
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    api.get("/plans").then(({ data }) => setData(data)).catch(() => setError("Could not load proposed plans. Early access is still free. Try again."));
  };

  useEffect(() => {
    load();
  }, []);

  const upgrade = async (plan) => {
    if (!user) {
      nav(`/signup?next=${encodeURIComponent(`/pricing?plan=${plan.id}`)}`);
      return;
    }
    setBusy(plan.id);
    try {
      await api.post("/interest", { plan: plan.id });
      toast.success(`Noted — you'll hear from us when ${plan.name} opens. Everything stays free until then.`);
    } catch {
      toast.error("Could not record that. Try again in a moment.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rp-page">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 lg:px-10 pt-16 pb-24">
        <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Pricing</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">Free while we earn your trust.</h1>
        <p className="text-zinc-400 text-lg max-w-[65ch] leading-relaxed">
          Early access is free, with no card and no automatic upgrade. Use the working product, tell us where it helps, and help shape the paid offering.
        </p>

        {data?.early_access && (
          <div className="mt-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-medium" data-testid="early-access-badge">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Free early access · no card
          </div>
        )}

        <section className="mt-10 max-w-[65ch]" data-testid="available-today">
          <h2 className="font-display text-2xl mb-3">Available today, free</h2>
          <p className="text-zinc-400 leading-relaxed">HTTP / JSON, Airtable and read-only Postgres Checks; record-growth and sampled-field checks; scheduled heartbeats; reported workflow failures; Slack, Discord and configured email alerts; delivery tests; and read-only public status links. Accounts are single-user. Connector limits apply.</p>
          <Link to="/setup" className="rp-inline inline-block mt-3" data-testid="pricing-setup-link">Read the setup guide and verification limits</Link>
        </section>
        <h2 className="font-display text-2xl mt-12 mb-3">Proposed paid packages</h2>
        <p className="text-sm text-quiet">These prices and allowances are proposals, not current limits or a purchase offer. Client grouping, branded pages and priority delivery are not available.</p>
        {user && params.get("plan") && <p className="text-sm text-zinc-300 mt-4" data-testid="pricing-interest-prompt">You're signed in. Select “I'd pay for…” below to record your interest. No payment is taken.</p>}
        {error && <p role="alert" className="text-sm text-zinc-300 mt-6" data-testid="pricing-error">{error} <button className="rp-inline" onClick={load} data-testid="pricing-retry">Retry</button></p>}
        {!data && !error && <p role="status" className="text-sm text-quiet mt-6">Loading proposed plans…</p>}
        <div className="grid md:grid-cols-3 gap-5 mt-6">
          {(data?.plans || []).map((p) => (
            <div key={p.id} className={`rp-card p-7 flex flex-col ${p.id === "pro" ? "border-emerald-500/40" : ""}`} data-testid={`plan-${p.id}`}>
              <p className="font-display text-2xl">{p.name}</p>
              <p className="font-mono text-sm text-zinc-400 mt-1">{p.planned_price}<span className="text-quiet"> · proposed</span></p>
              <p className="text-sm text-zinc-400 mt-4 leading-relaxed">{p.for}</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-300 flex-1">
                <li className="flex gap-2"><CheckIcon size={15} className="text-emerald-400 mt-0.5 shrink-0" /><span>{typeof p.limits.checks === "number" ? `${p.limits.checks} Checks` : p.limits.checks} · {p.limits.history} history{p.id === "free" && <span className="text-quiet"> (planned)</span>}</span></li>
                <li className="flex gap-2"><CheckIcon size={15} className="text-emerald-400 mt-0.5 shrink-0" /> Connectors: {p.limits.connectors.join(", ")}</li>
                <li className="flex gap-2"><CheckIcon size={15} className="text-emerald-400 mt-0.5 shrink-0" /> Alerts: {p.limits.channels.join(", ")}</li>
                {(p.limits.extras || []).map((x) => (
                  <li key={x} className="flex gap-2"><CheckIcon size={15} className="text-emerald-400 mt-0.5 shrink-0" /> {x}</li>
                ))}
              </ul>
              <button
                className={p.id === "free" ? "rp-btn-ghost mt-8 justify-center" : "rp-btn-primary mt-8 justify-center"}
                onClick={() => (p.id === "free" ? nav(user ? "/dashboard" : "/signup") : upgrade(p))}
                disabled={busy === p.id}
                data-testid={`plan-cta-${p.id}`}
              >
                {p.id === "free" ? (user ? "Go to dashboard" : "Start free") : busy === p.id ? "Saving…" : `I'd pay for ${p.name}`}
              </button>
            </div>
          ))}
        </div>

        <p className="text-sm text-quiet mt-10 max-w-[65ch] leading-relaxed" data-testid="pricing-history-note">
          What's enforced today: every account keeps 90 days of run history (retaining at least the newest 35 runs and newest 30 PASS runs per Check) while early access lasts.
          Per-plan history windows arrive with billing.
        </p>
        <p className="text-sm text-quiet mt-4 max-w-[65ch] leading-relaxed">
          "I'd pay for…" records your interest and nothing else — no card, no charge. It's how we decide which tier to open first.
          Questions about what's stored? <Link to="/data" className="rp-inline">What we store</Link>.
        </p>
      </div>
      <Footer />
    </div>
  );
}
