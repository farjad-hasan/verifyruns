import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import Nav from "../components/Nav";
import Timeline from "../components/Timeline";
import CopyButton from "../components/CopyButton";
import { toast } from "sonner";
import { ArrowLeft, Play, Trash2, RefreshCw, X, Bell, BellOff, Save, Pencil, Globe2, Filter, Moon, Sun } from "lucide-react";

export default function CheckDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [check, setCheck] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [running, setRunning] = useState(false);
  const [filters, setFilters] = useState({ verdict: "all", trigger: "all", range: "all" });

  const backendUrl = process.env.REACT_APP_BACKEND_URL;

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([
        api.get(`/checks/${id}`),
        api.get(`/checks/${id}/runs?limit=50`),
      ]);
      setCheck(c.data);
      setRuns(r.data);
    } catch {
      /* 401 handled by axios interceptor */
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Live refresh every 10s while the page is open
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // Poll while a run is queued
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const t = setInterval(() => { if (alive) load(); }, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [running, load]);

  const webhookUrl = useMemo(
    () => (check ? `${backendUrl}/api/hook/${check.webhook_secret}` : ""),
    [check, backendUrl]
  );
  const curlWithClaim = useMemo(
    () => (webhookUrl ? `curl -X POST "${webhookUrl}" -H "content-type: application/json" -d '{"wrote": 3}'` : ""),
    [webhookUrl]
  );
  const curlExample = useMemo(
    () => (webhookUrl ? `curl -X POST "${webhookUrl}"` : ""),
    [webhookUrl]
  );

  const runNow = async () => {
    setRunning(true);
    try {
      const { data } = await api.post(`/checks/${id}/run`);
      toast.success("Check queued");
      // Stop polling after a few seconds
      setTimeout(async () => { await load(); setRunning(false); }, 4000);
      return data;
    } catch {
      setRunning(false);
      toast.error("Could not queue run");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this check and all its runs?")) return;
    await api.delete(`/checks/${id}`);
    toast.success("Check deleted");
    nav("/dashboard");
  };

  const filteredRuns = useMemo(() => applyRunFilters(runs, filters), [runs, filters]);

  if (!check) {
    return (
      <div className="min-h-screen"><Nav />
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-12 text-zinc-500 font-mono">Loading…</div>
      </div>
    );
  }

  const timelineRuns = [...runs].slice(0, 30).reverse(); // newest on right
  const lastVerdict = runs.length ? runs[0].verdict : null;

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-10">
        <Link to="/dashboard" className="rp-link text-sm inline-flex items-center gap-1.5 mb-6" data-testid="back-to-dashboard">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
              {connectorLabel(check.connector_kind)} check
            </p>
            <CheckNameHeader check={check} onSaved={load} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lastVerdict === "PASS" && <span className="badge-pass">Pass</span>}
            {lastVerdict === "FAIL" && <span className="badge-fail">Fail</span>}
            {check.is_snoozed && <SnoozedBadge until={check.snooze_until} />}
            <SnoozeControl check={check} onSaved={load} />
            <button className="rp-btn-ghost" onClick={runNow} disabled={running} data-testid="run-now-btn">
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? "Running…" : "Run check now"}
            </button>
            <button className="rp-btn-danger" onClick={remove} data-testid="delete-check-btn">
              <Trash2 size={13} className="inline mr-1" /> Delete
            </button>
          </div>
        </div>

        {/* Timeline hero */}
        <div className="rp-card p-6 sm:p-8 mt-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Last 30 runs</p>
            <p className="text-xs text-zinc-500 font-mono">newest &rarr;</p>
          </div>
          {timelineRuns.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-zinc-500 font-mono text-sm">No runs yet. Trigger your workflow, or click &ldquo;Run check now&rdquo;.</p>
            </div>
          ) : (
            <Timeline runs={timelineRuns} hero onRunClick={setSelectedRun} testid="detail-timeline" />
          )}
        </div>

        {/* Webhook */}
        <div className="rp-card p-6 sm:p-8 mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="font-display text-lg">Webhook URL</p>
            <CopyButton text={webhookUrl} testid="copy-webhook-url" />
          </div>
          <p className="text-sm text-zinc-500 mb-4">
            Add one HTTP Request node at the end of your n8n / Make / Zapier workflow that POSTs to this URL.
          </p>
          <div className="mono-block break-all" data-testid="webhook-url">{webhookUrl}</div>

          <div className="flex items-center justify-between mt-6 mb-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500">curl example</p>
            <CopyButton text={curlExample} testid="copy-curl" />
          </div>
          <div className="mono-block" data-testid="curl-example">{curlExample}</div>

          <div className="flex items-center justify-between mt-6 mb-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Tell VerifyRuns what you wrote (optional)</p>
            <CopyButton text={curlWithClaim} testid="copy-curl-claim" />
          </div>
          <div className="mono-block break-all" data-testid="curl-claim-example">{curlWithClaim}</div>
          <p className="text-xs text-zinc-500 mt-2">
            Send <code className="font-mono">{"{"}"wrote": N{"}"}</code> in the body and the verdict reconciles your workflow's own count against the destination.
            n8n: <code className="font-mono">{"{{ $input.all().length }}"}</code> · Make: the bundle count · Zapier: the step's item count.
          </p>
        </div>

        {/* Config + Expectations */}
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="rp-card p-6 sm:p-8">
            <p className="font-display text-lg mb-4">Destination</p>
            <dl className="space-y-3 text-sm">
              {check.connector_kind === "postgres" ? (
                <>
                  <Row k="Connection" v={check.config?.has_dsn ? check.config?.dsn_last4 : "(none)"} mono />
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Query</dt>
                    <dd className="mono-block whitespace-pre-wrap break-words text-xs" data-testid="check-query">{check.config?.query}</dd>
                  </div>
                </>
              ) : check.connector_kind === "airtable" ? (
                <>
                  <Row k="Base ID" v={check.config?.base_id} mono />
                  <Row k="Table" v={check.config?.table} mono />
                  <Row k="View" v={check.config?.view || "(default)"} mono />
                  <Row
                    k="Personal token"
                    v={check.config?.has_pat ? check.config?.pat_last4 : "(none)"}
                    mono
                  />
                </>
              ) : (
                <>
                  <Row k="GET url" v={check.config?.url} mono />
                  <Row k="JSON path" v={check.config?.json_path || "(root)"} mono />
                  <Row k="Newest key" v={check.config?.newest_key || "(last element)"} mono />
                  <Row
                    k="Bearer token"
                    v={check.config?.has_bearer_token ? check.config?.bearer_token_last4 : "(none)"}
                    mono
                  />
                </>
              )}
            </dl>
          </div>
          <ExpectationsCard check={check} onSaved={load} />
        </div>

        {/* Alert channel */}
        <AlertChannelsCard check={check} onSaved={load} />

        {/* Public status card */}
        <PublicStatusCard check={check} onSaved={load} />

        {/* Run history */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Run history</p>
            <RunFilters filters={filters} setFilters={setFilters} />
          </div>
          {filteredRuns.length === 0 ? (
            <div className="rp-card p-8 text-center text-zinc-500 text-sm">
              {runs.length === 0
                ? "No runs yet. Verdicts will show up here after your workflow posts to the webhook."
                : "No runs match the current filters."}
            </div>
          ) : (
            <ul className="rp-card divide-y divide-[#27272A]">
              {filteredRuns.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedRun(r)}
                    className="w-full text-left p-5 hover:bg-[#18181B] transition-colors flex items-center gap-5"
                    data-testid={`run-row-${r.id}`}
                  >
                    <span className={r.verdict === "PASS" ? "badge-pass" : "badge-fail"}>{r.verdict}</span>
                    <span className="text-sm text-zinc-300 flex-1 break-words">{r.diff_message}</span>
                    <span className="text-xs text-zinc-500 font-mono whitespace-nowrap">{formatDate(r.timestamp)}</span>
                    <span className="text-[10px] text-zinc-600 font-mono uppercase">{r.trigger}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedRun && (
        <RunPanel
          run={selectedRun}
          previousPassFingerprint={findPreviousPassFingerprint(runs, selectedRun)}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-start gap-4">
      <dt className="text-zinc-500 text-xs uppercase tracking-wider min-w-[140px] pt-0.5">{k}</dt>
      <dd className={`text-zinc-100 break-all ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const CONNECTOR_LABELS = { http_json: "HTTP / JSON", airtable: "Airtable", postgres: "Postgres" };
export function connectorLabel(kind) {
  return CONNECTOR_LABELS[kind] || "HTTP / JSON";
}

function RunPanel({ run, previousPassFingerprint, onClose }) {
  const diff = previousPassFingerprint ? computeFpDiff(previousPassFingerprint, run.fingerprint || {}) : null;
  return (
    <div className="fixed inset-0 z-40" data-testid="run-panel">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[540px] bg-[#0A0A0A] border-l border-[#27272A] overflow-y-auto">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <span className={run.verdict === "PASS" ? "badge-pass" : "badge-fail"}>{run.verdict}</span>
            <button onClick={onClose} className="rp-link" data-testid="close-run-panel">
              <X size={18} />
            </button>
          </div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Verdict</p>
          <p className="text-zinc-100 leading-relaxed mb-8" data-testid="run-diff-message">{run.diff_message}</p>

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">When</p>
          <p className="text-zinc-300 font-mono text-sm mb-8">
            {formatDate(run.timestamp)} · {run.trigger}
            {typeof run.claimed_new === "number" && <span className="text-zinc-500"> · workflow claimed {run.claimed_new}</span>}
          </p>
          {Array.isArray(run.alerts_sent) && run.alerts_sent.length > 0 && (
            <p className="text-xs font-mono text-zinc-500 -mt-6 mb-8" data-testid="run-alerts-sent">
              alerted: {run.alerts_sent.map((a) => `${a.kind} ${a.ok ? "✓" : "✗"}`).join(" · ")}
            </p>
          )}
          {run.body_note && (
            <p className="text-xs text-amber-400 -mt-6 mb-8 font-mono" data-testid="run-body-note">{run.body_note}</p>
          )}

          {run.fingerprint && typeof run.fingerprint.record_count === "number" && (
            <>
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Records</p>
              <p className="text-zinc-300 font-mono text-sm mb-8 flex flex-wrap items-center gap-2" data-testid="run-record-count">
                <span>
                  {run.fingerprint.record_count.toLocaleString()} records
                  {typeof run.fingerprint.sample_size === "number" && run.fingerprint.sample_size < run.fingerprint.record_count
                    ? ` (${run.fingerprint.sample_size.toLocaleString()} sampled)`
                    : ""}
                </span>
                {run.count_capped && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/40 text-amber-400" title="The read stopped at the configured ceiling; the destination has at least this many records.">count capped</span>
                )}
                {run.count_estimated && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500/40 text-amber-400" title="The full count timed out; this is the sample length.">count estimated</span>
                )}
              </p>
            </>
          )}

          {diff && (
            <>
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Diff vs last PASS</p>
              <div className="rp-card p-4 mb-8 space-y-2 text-sm" data-testid="fingerprint-diff">
                <DiffRow label="Record count" a={diff.prev.record_count} b={diff.now.record_count} delta={diff.record_delta} />
                <DiffRow label="Field count" a={diff.prev.fields.length} b={diff.now.fields.length} delta={diff.now.fields.length - diff.prev.fields.length} />
                {diff.added_fields.length > 0 && (
                  <p className="text-emerald-400 font-mono text-xs">+ added: {diff.added_fields.join(", ")}</p>
                )}
                {diff.removed_fields.length > 0 && (
                  <p className="text-red-400 font-mono text-xs">− removed: {diff.removed_fields.join(", ")}</p>
                )}
                {diff.null_changes.length > 0 && (
                  <div className="pt-2 border-t border-[#27272A] mt-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Emptiness changed</p>
                    {diff.null_changes.map((c) => (
                      <p key={c.field} className="font-mono text-xs text-zinc-300">
                        <span className="text-zinc-500">{c.field}</span>: {c.prev}% → {c.now}%
                      </p>
                    ))}
                  </div>
                )}
                {diff.added_fields.length === 0 && diff.removed_fields.length === 0 && diff.record_delta === 0 && diff.null_changes.length === 0 && (
                  <p className="text-zinc-500 text-xs font-mono">No shape changes.</p>
                )}
              </div>
            </>
          )}

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Fingerprint</p>
          <div className="mono-block mb-8">{JSON.stringify(run.fingerprint, null, 2)}</div>

          {run.sample ? (
            <>
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Sample · expires {formatDate(run.sample.expires_at)}</p>
              <div className="mono-block mb-8" data-testid="run-sample">{JSON.stringify({ newest_record: run.sample.newest_record, newest_window: run.sample.newest_window, error_details: run.sample.error_details }, null, 2)}</div>
            </>
          ) : (
            run.fingerprint && "sample_stored" in run.fingerprint && (
              <p className="text-xs text-zinc-500 mb-8" data-testid="run-sample-note">
                Destination rows are not stored for this run — only a hash of the newest record. Turn on "Store raw samples" in Expectations to keep them for 30 days.
              </p>
            )
          )}

          {run.error_details && (
            <>
              <p className="text-xs uppercase tracking-widest text-red-400 mb-2">Error details</p>
              <div className="mono-block text-red-300">{run.error_details}</div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}


function AlertChannelsCard({ check, onSaved }) {
  const [kind, setKind] = useState("slack");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(null);

  useEffect(() => {
    api.get("/meta").then(({ data }) => setEmailAvailable(!!data.email_alerts)).catch(() => setEmailAvailable(false));
  }, []);

  const placeholder = {
    slack: "https://hooks.slack.com/services/…",
    discord: "https://discord.com/api/webhooks/…",
    email: "ops@example.com",
  }[kind];

  const add = async () => {
    if (!target.trim()) return;
    setBusy(true);
    try {
      await api.post(`/checks/${check.id}/channels`, { kind, target: target.trim() });
      toast.success("Channel added");
      setTarget("");
      await onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add channel");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ch) => {
    if (!window.confirm(`Remove the ${ch.kind} channel ending ${ch.last4.slice(-4)}?`)) return;
    try {
      await api.delete(`/checks/${check.id}/channels/${ch.id}`);
      toast.success("Channel removed");
      await onSaved();
    } catch {
      toast.error("Could not remove channel");
    }
  };

  const channels = check.alert_channels || [];
  return (
    <div className="rp-card p-6 sm:p-8" data-testid="alert-channels-card">
      <div className="flex items-center gap-2 mb-2">
        {channels.length ? <Bell size={18} className="text-emerald-400" /> : <BellOff size={18} className="text-zinc-500" />}
        <p className="font-display text-lg">Alert channels</p>
      </div>
      <p className="text-sm text-zinc-500 mb-4">
        Every channel gets one message on the first FAIL and one when the check recovers — never one per red run.
      </p>

      {channels.length > 0 && (
        <ul className="space-y-2 mb-5" data-testid="alert-channel-list">
          {channels.map((ch) => (
            <li key={ch.id} className="flex items-center justify-between rounded-lg border border-[#27272A] px-3 py-2 text-sm">
              <span className="font-mono text-zinc-300">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-3">{ch.kind}</span>
                {ch.last4}
              </span>
              <button className="rp-link text-xs text-zinc-500 hover:text-red-400" onClick={() => remove(ch)} data-testid={`remove-channel-${ch.id}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid sm:grid-cols-[140px_1fr_auto] gap-2 items-center">
        <select className="rp-input font-mono" value={kind} onChange={(e) => setKind(e.target.value)} data-testid="channel-kind-select">
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
          <option value="email" disabled={emailAvailable === false}>
            {emailAvailable === false ? "Email (not configured on this host)" : "Email"}
          </option>
        </select>
        <input
          type={kind === "email" ? "email" : "url"}
          className="rp-input font-mono"
          placeholder={placeholder}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          data-testid="channel-target-input"
        />
        <button className="rp-btn-primary" onClick={add} disabled={busy || !target.trim()} data-testid="add-channel-btn">
          <Save size={14} /> {busy ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mt-2">Stored encrypted; only the last 4 characters are shown afterwards.</p>
    </div>
  );
}

function ExpectationsCard({ check, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [minNew, setMinNew] = useState(check.expectations?.min_new_records ?? 1);
  const [mode, setMode] = useState(check.expectations?.growth_mode || "growth");
  const [heartbeat, setHeartbeat] = useState(check.heartbeat_hours ?? "");
  const [storeSamples, setStoreSamples] = useState(!!check.store_samples);
  const [required, setRequired] = useState((check.expectations?.required_fields || []).join(", "));
  const [nonEmpty, setNonEmpty] = useState((check.expectations?.non_empty_fields || []).join(", "));
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setMinNew(check.expectations?.min_new_records ?? 1);
    setMode(check.expectations?.growth_mode || "growth");
    setHeartbeat(check.heartbeat_hours ?? "");
    setStoreSamples(!!check.store_samples);
    setRequired((check.expectations?.required_fields || []).join(", "));
    setNonEmpty((check.expectations?.non_empty_fields || []).join(", "));
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/checks/${check.id}`, {
        expectations: {
          min_new_records: Number(minNew) || 0,
          growth_mode: mode,
          required_fields: required.split(",").map((s) => s.trim()).filter(Boolean),
          non_empty_fields: nonEmpty.split(",").map((s) => s.trim()).filter(Boolean),
        },
        heartbeat_hours: heartbeat === "" ? null : Number(heartbeat),
        store_samples: storeSamples,
      });
      toast.success("Expectations updated");
      setEditing(false);
      await onSaved();
    } catch {
      toast.error("Could not update expectations");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-card p-6 sm:p-8" data-testid="expectations-card">
      <div className="flex items-center justify-between mb-4">
        <p className="font-display text-lg">Expectations</p>
        {!editing && (
          <button
            className="rp-btn-ghost !py-1.5 !px-3 !text-xs"
            onClick={startEdit}
            data-testid="edit-expectations-btn"
          >
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="space-y-3 text-sm">
          <Row k="Heartbeat" v={check.heartbeat_hours ? `expect a run every ${check.heartbeat_hours} h` : "(off)"} mono />
          <Row k="Raw samples" v={check.store_samples ? "stored for 30 days" : "not stored (hash only)"} mono />
          <Row k="Growth mode" v={check.expectations?.growth_mode || "growth"} mono />
          <Row k="Min new records per run" v={String(check.expectations?.min_new_records ?? 1)} mono />
          <Row k="Required fields" v={(check.expectations?.required_fields || []).join(", ") || "(none)"} mono />
          <Row k="Non-empty fields" v={(check.expectations?.non_empty_fields || []).join(", ") || "(none)"} mono />
        </dl>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Heartbeat — expect a run every … hours (blank = off)</label>
            <input
              type="number"
              min="1"
              max="720"
              className="rp-input font-mono"
              placeholder="24"
              value={heartbeat}
              onChange={(e) => setHeartbeat(e.target.value)}
              data-testid="edit-heartbeat-input"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Growth mode</label>
            <select className="rp-input font-mono" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="edit-mode-select">
                <option value="growth">Growth — must gain at least the minimum (or what the workflow claims)</option>
                <option value="steady">Steady — the count must not change</option>
                <option value="claimed">Claimed — every run must send {"{"}"wrote": N{"}"} and the destination must gain N</option>
              </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Minimum new records per run (0 = growth optional)</label>
            <input
              type="number"
              min="0"
              className="rp-input font-mono"
              value={minNew}
              onChange={(e) => setMinNew(e.target.value)}
              data-testid="edit-minnew-input"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Required fields (comma-separated)</label>
            <input
              type="text"
              className="rp-input font-mono"
              placeholder="id, price, created_at"
              value={required}
              onChange={(e) => setRequired(e.target.value)}
              data-testid="edit-required-input"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Fields that must be non-empty</label>
            <input
              type="text"
              className="rp-input font-mono"
              placeholder="email, customer_id"
              value={nonEmpty}
              onChange={(e) => setNonEmpty(e.target.value)}
              data-testid="edit-nonempty-input"
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-emerald-500" checked={storeSamples} onChange={(e) => setStoreSamples(e.target.checked)} data-testid="edit-store-samples" />
            <span className="text-sm text-zinc-300">Store raw samples for 30 days
              <span className="block text-xs text-zinc-500">Keeps the newest 5 destination rows and upstream error bodies per run so you can inspect them. Off by default: only a hash of the newest row is kept.</span>
            </span>
          </label>
          <div className="flex gap-2 pt-2">
            <button className="rp-btn-primary" onClick={save} disabled={busy} data-testid="save-expectations-btn">
              <Save size={14} /> {busy ? "Saving…" : "Save"}
            </button>
            <button className="rp-btn-ghost" onClick={() => setEditing(false)} data-testid="cancel-expectations-btn">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffRow({ label, a, b, delta }) {
  const sign = delta > 0 ? "+" : "";
  const color = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-zinc-500";
  return (
    <div className="flex items-center justify-between font-mono text-xs">
      <span className="text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="text-zinc-300">
        {a} <span className="text-zinc-600">→</span> {b} <span className={color}>({sign}{delta})</span>
      </span>
    </div>
  );
}

function computeFpDiff(prev, now) {
  const prevFields = prev?.fields || [];
  const nowFields = now?.fields || [];
  const prevSet = new Set(prevFields);
  const nowSet = new Set(nowFields);
  const added = nowFields.filter((f) => !prevSet.has(f));
  const removed = prevFields.filter((f) => !nowSet.has(f));
  const nullChanges = [];
  const prevNull = prev?.null_pct || {};
  const nowNull = now?.null_pct || {};
  for (const f of nowFields) {
    if (prevSet.has(f) && (prevNull[f] ?? 0) !== (nowNull[f] ?? 0)) {
      nullChanges.push({ field: f, prev: prevNull[f] ?? 0, now: nowNull[f] ?? 0 });
    }
  }
  return {
    prev: { record_count: prev?.record_count ?? 0, fields: prevFields },
    now: { record_count: now?.record_count ?? 0, fields: nowFields },
    record_delta: (now?.record_count ?? 0) - (prev?.record_count ?? 0),
    added_fields: added,
    removed_fields: removed,
    null_changes: nullChanges,
  };
}

function findPreviousPassFingerprint(allRuns, current) {
  // allRuns is newest→oldest; find first PASS strictly older than current
  if (!current) return null;
  const currentTs = new Date(current.timestamp).getTime();
  for (const r of allRuns) {
    if (r.id === current.id) continue;
    if (r.verdict !== "PASS") continue;
    if (new Date(r.timestamp).getTime() < currentTs) return r.fingerprint;
  }
  return null;
}

function applyRunFilters(runs, filters) {
  const now = Date.now();
  const rangeMs = { "24h": 24 * 3600e3, "7d": 7 * 24 * 3600e3, "30d": 30 * 24 * 3600e3 }[filters.range];
  return runs.filter((r) => {
    if (filters.verdict !== "all" && r.verdict !== filters.verdict) return false;
    if (filters.trigger !== "all" && r.trigger !== filters.trigger) return false;
    if (rangeMs && (now - new Date(r.timestamp).getTime()) > rangeMs) return false;
    return true;
  });
}

function RunFilters({ filters, setFilters }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v });
  const selectCls = "bg-[#0A0A0A] border border-[#27272A] text-zinc-200 text-xs rounded-md px-2 py-1.5 font-mono focus:outline-none focus:border-[#52525B]";
  return (
    <div className="flex items-center gap-2" data-testid="run-filters">
      <Filter size={13} className="text-zinc-500" />
      <select className={selectCls} value={filters.verdict} onChange={(e) => set("verdict", e.target.value)} data-testid="filter-verdict">
        <option value="all">All verdicts</option>
        <option value="PASS">Pass only</option>
        <option value="FAIL">Fail only</option>
      </select>
      <select className={selectCls} value={filters.trigger} onChange={(e) => set("trigger", e.target.value)} data-testid="filter-trigger">
        <option value="all">Any trigger</option>
        <option value="webhook">Webhook</option>
        <option value="manual">Manual</option>
      </select>
      <select className={selectCls} value={filters.range} onChange={(e) => set("range", e.target.value)} data-testid="filter-range">
        <option value="all">All time</option>
        <option value="24h">Last 24h</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
      </select>
    </div>
  );
}

function PublicStatusCard({ check, onSaved }) {
  const [busy, setBusy] = useState(false);
  const publicUrl = check.public_token
    ? `${window.location.origin}/status/${check.public_token}`
    : "";

  const enable = async () => {
    setBusy(true);
    try {
      await api.post(`/checks/${check.id}/public`);
      toast.success("Public status enabled");
      await onSaved();
    } catch {
      toast.error("Could not enable public status");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    if (!window.confirm("Disable the public status page? The old link will stop working.")) return;
    setBusy(true);
    try {
      await api.delete(`/checks/${check.id}/public`);
      toast.success("Public status disabled");
      await onSaved();
    } catch {
      toast.error("Could not disable public status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-card p-6 sm:p-8 mt-6" data-testid="public-status-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Globe2 size={16} className={check.is_public ? "text-emerald-400" : "text-zinc-500"} />
          <p className="font-display text-lg">Public status page</p>
        </div>
        {check.is_public ? (
          <button className="rp-btn-danger" onClick={disable} disabled={busy} data-testid="disable-public-btn">
            Disable
          </button>
        ) : (
          <button className="rp-btn-primary !py-1.5 !px-3 !text-xs" onClick={enable} disabled={busy} data-testid="enable-public-btn">
            {busy ? "Enabling…" : "Enable"}
          </button>
        )}
      </div>
      {check.is_public ? (
        <>
          <p className="text-sm text-zinc-500 mb-3">
            Anyone with this link can see verdicts and timestamps — no destination URL, tokens, or fingerprints are exposed.
          </p>
          <div className="flex items-center gap-2">
            <div className="mono-block flex-1 break-all" data-testid="public-status-url">{publicUrl}</div>
            <CopyButton text={publicUrl} testid="copy-public-status" />
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-500">
          Generate a shareable read-only URL so teammates can debug a failing check without an account.
        </p>
      )}
    </div>
  );
}


function CheckNameHeader({ check, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(check.name);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === check.name) {
      setEditing(false);
      setName(check.name);
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/checks/${check.id}`, { name: trimmed });
      toast.success("Check renamed");
      setEditing(false);
      await onSaved();
    } catch {
      toast.error("Could not rename check");
      setName(check.name);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setEditing(false);
    setName(check.name);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="rp-input font-display !text-3xl sm:!text-4xl !py-1 !px-2 tracking-tight bg-transparent"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          data-testid="rename-check-input"
        />
        <button className="rp-btn-primary !py-1.5 !px-3 !text-xs" onClick={save} disabled={busy} data-testid="rename-check-save">
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="rp-btn-ghost !py-1.5 !px-3 !text-xs" onClick={cancel} disabled={busy} data-testid="rename-check-cancel">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-3 text-left"
      title="Click to rename"
      data-testid="rename-check-trigger"
    >
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight" data-testid="check-name">
        {check.name}
      </h1>
      <Pencil
        size={16}
        className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </button>
  );
}


function SnoozedBadge({ until }) {
  const t = until ? new Date(until) : null;
  return (
    <span
      className="text-[11px] uppercase tracking-widest text-amber-400 border border-amber-500/30 bg-amber-500/5 rounded-full px-2 py-1 font-mono"
      title={t ? `Until ${t.toLocaleString()}` : "Snoozed"}
      data-testid="snoozed-badge"
    >
      Snoozed
    </span>
  );
}

function SnoozeControl({ check, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const snooze = async (hours) => {
    setBusy(true);
    setOpen(false);
    try {
      await api.post(`/checks/${check.id}/snooze`, { hours });
      toast.success(`Alerts snoozed for ${hours}h`);
      await onSaved();
    } catch {
      toast.error("Could not snooze");
    } finally {
      setBusy(false);
    }
  };
  const wake = async () => {
    setBusy(true);
    setOpen(false);
    try {
      await api.delete(`/checks/${check.id}/snooze`);
      toast.success("Alerts resumed");
      await onSaved();
    } catch {
      toast.error("Could not resume alerts");
    } finally {
      setBusy(false);
    }
  };

  if (check.is_snoozed) {
    return (
      <button className="rp-btn-ghost" onClick={wake} disabled={busy} data-testid="wake-btn">
        <Sun size={14} /> Resume alerts
      </button>
    );
  }
  return (
    <div className="relative">
      <button className="rp-btn-ghost" onClick={() => setOpen((v) => !v)} disabled={busy} data-testid="snooze-btn">
        <Moon size={14} /> Snooze
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 rp-card p-2 z-10 min-w-[140px]"
          data-testid="snooze-menu"
          onMouseLeave={() => setOpen(false)}
        >
          <button className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-[#18181B] rounded-md" onClick={() => snooze(1)} data-testid="snooze-1h">1 hour</button>
          <button className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-[#18181B] rounded-md" onClick={() => snooze(24)} data-testid="snooze-24h">24 hours</button>
        </div>
      )}
    </div>
  );
}

