import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import Nav from "../components/Nav";
import Timeline from "../components/Timeline";
import { Plus, Globe, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const [checks, setChecks] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    try {
      const { data } = await api.get("/checks");
      setChecks(data);
    } catch {
      /* 401 handled by axios interceptor */
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Dashboard</p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Your Checks</h1>
          </div>
          {checks && checks.length > 0 && (
            <Link to="/checks/new" className="rp-btn-primary" data-testid="new-check-btn">
              <Plus size={16} /> New check
            </Link>
          )}
        </div>

        {checks === null && (
          <div className="rp-card p-10 text-zinc-500 font-mono text-sm">Loading…</div>
        )}

        {checks && checks.length === 0 && <EmptyState />}

        {checks && checks.length > 0 && <HealthStrip checks={checks} />}

        {checks && checks.length > 0 && (
          <ul className="space-y-3">
            {checks.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => nav(`/checks/${c.id}`)}
                  className="w-full text-left rp-card p-6 hover:border-[#3F3F46] transition-colors flex items-center gap-6"
                  data-testid={`check-row-${c.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-display text-lg truncate">{c.name}</p>
                      {c.last_verdict === "PASS" && <span className="badge-pass">Pass</span>}
                      {c.last_verdict === "FAIL" && <span className="badge-fail">Fail</span>}
                      {c.is_snoozed && (
                        <span className="text-[10px] uppercase tracking-widest text-amber-400 font-mono" data-testid={`snoozed-${c.id}`}>Snoozed</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
                      <Globe size={11} /> {c.connector_kind === "airtable" ? "Airtable" : "HTTP / JSON"}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <Timeline runs={c.recent_runs || []} testid={`timeline-${c.id}`} />
                  </div>
                  <ArrowRight size={16} className="text-zinc-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rp-card p-10 sm:p-14" data-testid="dashboard-empty-state">
      <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Get set up</p>
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mb-8">
        Three steps to your first verdict.
      </h2>
      <ol className="space-y-6 mb-10">
        {[
          ["01", "Create a Check", "Give it a name, point it at the GET URL of your destination, add optional expectations."],
          ["02", "Paste the webhook", "Add one HTTP Request node at the end of your n8n / Make / Zapier workflow that POSTs to the webhook URL VerifyRuns gives you."],
          ["03", "Trigger your workflow", "After every run, VerifyRuns re-reads the destination and posts a PASS or FAIL to your dashboard."],
        ].map(([step, title, body]) => (
          <li key={step} className="flex gap-5">
            <span className="font-mono text-sm text-emerald-400 pt-1">{step}</span>
            <div>
              <p className="font-display text-lg mb-1">{title}</p>
              <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to="/checks/new" className="rp-btn-primary" data-testid="empty-new-check-btn">
        <Plus size={16} /> Create your first check
      </Link>
    </div>
  );
}


function HealthStrip({ checks }) {
  const passing = checks.filter((c) => c.last_verdict === "PASS").length;
  const failing = checks.filter((c) => c.last_verdict === "FAIL").length;
  const idle = checks.filter((c) => !c.last_verdict).length;
  return (
    <div className="rp-card p-5 mb-6 flex items-center gap-8" data-testid="health-strip">
      <Stat label="Passing" value={passing} color="text-emerald-400" dot="bg-emerald-500" testid="health-passing" />
      <Stat label="Failing" value={failing} color="text-red-400" dot="bg-red-500" testid="health-failing" />
      <Stat label="No runs yet" value={idle} color="text-zinc-400" dot="bg-zinc-600" testid="health-idle" />
      <div className="ml-auto text-xs text-zinc-500 font-mono hidden sm:block">Auto-refresh · 10s</div>
    </div>
  );
}

function Stat({ label, value, color, dot, testid }) {
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <div>
        <p className={`font-display text-2xl leading-none ${color}`}>{value}</p>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{label}</p>
      </div>
    </div>
  );
}
