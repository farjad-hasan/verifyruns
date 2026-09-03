import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import usePoll from "../lib/usePoll";
import useTitle from "../lib/useTitle";
import { connectorLabel } from "./CheckDetail";
import Timeline from "../components/Timeline";
import { Plus, Globe, ArrowRight } from "lucide-react";

export default function Dashboard() {
  useTitle("Dashboard");
  const [checks, setChecks] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/checks");
      setChecks(data);
      setError("");
    } catch (e) {
      /* the auth provider handles 401s route-side */
      if (e.response?.status !== 401) setError("Could not reach VerifyRuns. Retrying automatically.");
      throw e; // usePoll backs off on consecutive failures
    }
  }, []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  usePoll(load, { interval: 10000 });

  return (
    <div className="rp-page">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Your Checks</h1>
          </div>
          {checks && checks.length > 0 && (
            <Link to="/checks/new" className="rp-btn-primary" data-testid="new-check-btn">
              <Plus size={16} /> New Check
            </Link>
          )}
        </div>

        {checks === null && !error && (
          <div className="rp-card p-10 text-quiet text-sm">Loading…</div>
        )}
        {error && (
          <div className="rp-card p-8 flex flex-wrap items-center justify-between gap-4" data-testid="dashboard-error">
            <p className="text-sm text-zinc-200">{error}</p>
            <button className="rp-btn-ghost" onClick={load} data-testid="dashboard-retry">Retry now</button>
          </div>
        )}

        {checks && checks.length === 0 && <EmptyState />}

        {checks && checks.length > 0 && <HealthStrip checks={checks} />}

        {checks && checks.length > 0 && (
          <ul className="space-y-3">
            {checks.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/checks/${c.id}`}
                  className="w-full text-left rp-card p-6 hover:border-hairline-hover transition-colors flex items-center gap-6"
                  data-testid={`check-row-${c.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-display text-lg truncate">{c.name}</p>
                      {c.last_verdict === "PASS" && <span className="badge-pass">Pass</span>}
                      {c.last_verdict === "FAIL" && <span className="badge-fail">Fail</span>}
                      {c.heartbeat_hours && (
                        <span className="text-[11px] uppercase tracking-widest text-quiet font-mono" title="Heartbeat: a FAIL is recorded if no run arrives within this window" data-testid={`heartbeat-${c.id}`}>every {c.heartbeat_hours} h</span>
                      )}
                      {c.is_snoozed && (
                        <span className="text-[11px] uppercase tracking-widest text-amber-400 font-mono" data-testid={`snoozed-${c.id}`}>Snoozed</span>
                      )}
                    </div>
                    <p className="text-xs text-quiet font-mono flex items-center gap-1.5">
                      <Globe size={11} /> {connectorLabel(c.connector_kind)}
                    </p>
                    {latestSentence(c) && (
                      <p className="text-sm text-zinc-300 mt-3 break-words" data-testid={`latest-${c.id}`}>{latestSentence(c)}</p>
                    )}
                    <div className="sm:hidden mt-3">
                      <Timeline runs={(c.recent_runs || []).slice(-10)} total={10} testid={`timeline-sm-${c.id}`} static />
                    </div>
                  </div>
                  <div className="hidden sm:block shrink-0">
                    <Timeline runs={c.recent_runs || []} testid={`timeline-${c.id}`} static />
                  </div>
                  <ArrowRight size={16} className="text-quiet" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Footer />
    </div>
  );
}

function latestSentence(c) {
  const runs = c.recent_runs || [];
  return runs.length ? runs[runs.length - 1].diff_message : null;
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
        <Plus size={16} /> Create your first Check
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
      <Stat label="Passing" value={passing} color="text-emerald-400" square="pass" testid="health-passing" />
      <Stat label="Failing" value={failing} color="text-red-400" square="fail" testid="health-failing" />
      <Stat label="No runs yet" value={idle} color="text-zinc-400" square="" testid="health-idle" />
      <div className="ml-auto text-xs text-quiet font-mono hidden sm:block">Auto-refresh · 10s</div>
    </div>
  );
}

function Stat({ label, value, color, square, testid }) {
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <span className={`tl-square ${square}`} aria-hidden="true" />
      <div>
        <p className={`font-display text-2xl leading-none ${color}`}>{value}</p>
        <p className="text-[11px] uppercase tracking-widest text-quiet mt-1">{label}</p>
      </div>
    </div>
  );
}
