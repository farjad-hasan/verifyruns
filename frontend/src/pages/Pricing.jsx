import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

  useEffect(() => {
    api.get("/plans").then(({ data }) => setData(data)).catch(() => setData({ early_access: true, plans: [] }));
  }, []);

  const upgrade = async (plan) => {
    if (!user) {
      nav("/signup");
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
          VerifyRuns is in early access. Every feature below is on for everyone, at no cost, until the paid tiers open.
          The prices are what we plan to charge — if one looks wrong for what you'd get, tell us before we lock it in.
        </p>

        {data?.early_access && (
          <div className="mt-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-medium" data-testid="early-access-badge">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Early access · everything free · no card
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {(data?.plans || []).map((p) => (
            <div key={p.id} className={`rp-card p-7 flex flex-col ${p.id === "pro" ? "border-emerald-500/40" : ""}`} data-testid={`plan-${p.id}`}>
              <p className="font-display text-2xl">{p.name}</p>
              <p className="font-mono text-sm text-zinc-400 mt-1">{p.planned_price}{p.id !== "free" && <span className="text-quiet"> · planned</span>}</p>
              <p className="text-sm text-zinc-400 mt-4 leading-relaxed">{p.for}</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-300 flex-1">
                <li className="flex gap-2"><CheckIcon size={15} className="text-emerald-400 mt-0.5 shrink-0" /><span>{String(p.limits.checks)} Checks · {p.limits.history} history{p.id === "free" && <span className="text-quiet"> (planned)</span>}</span></li>
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
          What's enforced today: every account keeps 90 days of run history (never fewer than the newest 35 runs per Check) while early access lasts.
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
