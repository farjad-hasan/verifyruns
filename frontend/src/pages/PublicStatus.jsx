import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import Timeline from "../components/Timeline";
import usePoll from "../lib/usePoll";
import useTitle from "../lib/useTitle";
import { Activity, AlertTriangle } from "lucide-react";
import { connectorLabel } from "./CheckDetail";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "local time";
  }
}

function alertSummary(run) {
  const sent = run?.alerts_sent;
  if (!Array.isArray(sent) || sent.length === 0) return "";
  return sent.map((a) => `${a.kind} ${a.ok ? "✓" : "✗"}`).join(" · ");
}

export default function PublicStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/public/checks/${token}`);
      setData(data);
      setError("");
    } catch (e) {
      if (e.response?.status === 404) setError("This status page doesn't exist or has been disabled.");
      else setError("Could not load status.");
      throw e; // usePoll backs off on consecutive failures
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  usePoll(load, { interval: 30000 }); // a wall display should cost the Worker near-zero
  useTitle(data?.name || "Status");

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="rp-card p-10 max-w-md text-center">
          <AlertTriangle size={22} className="text-red-400 mx-auto mb-3" />
          <p className="text-zinc-200">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-quiet font-mono text-sm">Loading…</div>;
  }

  const timelineRuns = [...data.runs].reverse(); // oldest -> newest for right-anchored strip

  return (
    <div className="min-h-screen">
      <header className="border-b border-raised bg-ink/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="public-nav-logo">
            <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Activity size={15} className="text-emerald-400" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">VerifyRuns</span>
          </Link>
          <span className="text-[11px] uppercase tracking-widest text-quiet font-mono">Public status</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 lg:px-10 py-16">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-widest text-quiet">{connectorLabel(data.connector_kind)} check</p>
          {data.last_verdict === "PASS" && <span className="badge-pass" data-testid="public-last-verdict">Pass</span>}
          {data.last_verdict === "FAIL" && <span className="badge-fail" data-testid="public-last-verdict">Fail</span>}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-10 break-words" data-testid="public-check-name">{data.name}</h1>

        <div className="rp-card p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-quiet">{timelineRuns.length < 30 ? `${timelineRuns.length} of 30 runs` : "Last 30 runs"}</p>
            <p className="text-xs text-quiet font-mono">newest →</p>
          </div>
          {timelineRuns.length === 0 ? (
            <p className="text-quiet font-mono text-sm py-6 text-center">No runs recorded yet.</p>
          ) : (
            <Timeline runs={timelineRuns} hero testid="public-timeline" />
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-4 text-xs text-quiet font-mono" data-testid="public-meta">
            {data.checked_at && <span>as of {new Date(data.checked_at).toLocaleString()} ({timeZone()})</span>}
            {data.heartbeat_hours && <span>expects a run every {data.heartbeat_hours} h</span>}
            {alertSummary(data.runs?.[0]) && <span data-testid="public-alerts">alerted: {alertSummary(data.runs[0])}</span>}
          </div>
        </div>

        <div className="mt-10">
          <p className="text-xs uppercase tracking-widest text-quiet mb-3">Recent verdicts</p>
          {data.runs.length === 0 ? (
            <div className="rp-card p-8 text-center text-quiet text-sm">Nothing to show yet.</div>
          ) : (
            <ul className="rp-card divide-y divide-hairline">
              {data.runs.map((r) => (
                <li key={r.id} className="p-5 flex items-start gap-5" data-testid={`public-run-${r.id}`}>
                  <span className={r.verdict === "PASS" ? "badge-pass" : "badge-fail"}>{r.verdict}</span>
                  <span className="text-sm text-zinc-300 flex-1 break-words">{r.diff_message}</span>
                  <span className="text-xs text-quiet font-mono whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-quiet mt-10 text-center">
          Read-only status page powered by <Link to="/" className="underline underline-offset-4 hover:text-zinc-300">VerifyRuns</Link>.
        </p>
      </div>
    </div>
  );
}
