import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { formatError } from "../lib/api";
import Nav from "../components/Nav";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function NewCheck() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("http_json");
  // HTTP / JSON
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [newestKey, setNewestKey] = useState("");
  // Airtable
  const [baseId, setBaseId] = useState("");
  const [table, setTable] = useState("");
  const [pat, setPat] = useState("");
  const [view, setView] = useState("");
  // Postgres
  const [dsn, setDsn] = useState("");
  const [query, setQuery] = useState("");
  // Expectations + alerts
  const [minNew, setMinNew] = useState(1);
  const [mode, setMode] = useState("growth");
  const [required, setRequired] = useState("");
  const [nonEmpty, setNonEmpty] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [retryBeforeAlert, setRetryBeforeAlert] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let config;
      if (kind === "airtable") {
        config = {
          base_id: baseId.trim(),
          table: table.trim(),
          personal_access_token: pat.trim() || null,
          view: view.trim() || null,
        };
      } else if (kind === "postgres") {
        config = {
          dsn: dsn.trim(),
          query: query.trim(),
        };
      } else {
        config = {
          url,
          bearer_token: token || null,
          json_path: jsonPath || null,
          newest_key: newestKey.trim() || null,
        };
      }
      const payload = {
        name,
        connector_kind: kind,
        config,
        expectations: {
          min_new_records: Number(minNew) || 0,
          growth_mode: mode,
          required_fields: required.split(",").map((s) => s.trim()).filter(Boolean),
          non_empty_fields: nonEmpty.split(",").map((s) => s.trim()).filter(Boolean),
        },
        alert_slack_webhook: slackWebhook.trim() || null,
        retry_before_alert: retryBeforeAlert,
      };
      const { data } = await api.post("/checks", payload);
      toast.success("Check created");
      nav(`/checks/${data.id}`);
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12">
        <Link to="/dashboard" className="rp-link text-sm inline-flex items-center gap-1.5 mb-6" data-testid="back-to-dashboard">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">New Check</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-10">Create a check</h1>

        <form onSubmit={submit} className="space-y-10">
          <Section title="Name">
            <input required className="rp-input" placeholder="orders-sync" value={name} onChange={(e) => setName(e.target.value)} data-testid="check-name-input" />
          </Section>

          <Section title="Destination" subtitle="Pick the connector VerifyRuns should re-read after each run.">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <ConnectorOption
                active={kind === "http_json"}
                onClick={() => setKind("http_json")}
                title="HTTP / JSON"
                sub="Any REST endpoint returning an array"
                testid="connector-http-json"
              />
              <ConnectorOption
                active={kind === "airtable"}
                onClick={() => setKind("airtable")}
                title="Airtable"
                sub="A base + table you own"
                testid="connector-airtable"
              />
              <ConnectorOption
                active={kind === "postgres"}
                onClick={() => setKind("postgres")}
                title="Postgres"
                sub="A read-only SELECT query"
                testid="connector-postgres"
              />
            </div>

            {kind === "http_json" && (
              <div className="space-y-3">
                <input required type="url" className="rp-input font-mono" placeholder="https://api.example.com/v1/orders" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="check-url-input" />
                <input type="text" className="rp-input font-mono" placeholder="Bearer token (optional, encrypted at rest)" value={token} onChange={(e) => setToken(e.target.value)} data-testid="check-token-input" />
                <input type="text" className="rp-input font-mono" placeholder="JSON path to array (optional, e.g. data.records)" value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} data-testid="check-jsonpath-input" />
                <input type="text" className="rp-input font-mono" placeholder="Newest-record key (optional, e.g. created_at — otherwise the last element is newest)" value={newestKey} onChange={(e) => setNewestKey(e.target.value)} data-testid="check-newestkey-input" />
                <p className="text-xs text-zinc-500 leading-relaxed">Leave the path empty if the response body itself is an array.</p>
              </div>
            )}

            {kind === "airtable" && (
              <div className="space-y-3">
                <input required type="text" className="rp-input font-mono" placeholder="Base ID (appXXXXXXXXXXXXXX)" value={baseId} onChange={(e) => setBaseId(e.target.value)} data-testid="check-base-id-input" />
                <input required type="text" className="rp-input font-mono" placeholder="Table name (e.g. Orders)" value={table} onChange={(e) => setTable(e.target.value)} data-testid="check-table-input" />
                <input required type="text" className="rp-input font-mono" placeholder="Personal Access Token (encrypted at rest)" value={pat} onChange={(e) => setPat(e.target.value)} data-testid="check-pat-input" />
                <input type="text" className="rp-input font-mono" placeholder="View name (optional)" value={view} onChange={(e) => setView(e.target.value)} data-testid="check-view-input" />
                <p className="text-xs text-zinc-500 leading-relaxed">
                  VerifyRuns lists up to 100 records at a time. Create a PAT at
                  <a className="underline underline-offset-4 hover:text-zinc-300 ml-1" href="https://airtable.com/create/tokens" target="_blank" rel="noreferrer">airtable.com/create/tokens</a>
                  &nbsp;with <span className="font-mono">data.records:read</span> for the base.
                </p>
              </div>
            )}

            {kind === "postgres" && (
              <div className="space-y-3">
                <input required type="text" className="rp-input font-mono" placeholder="postgres://user:pass@host:5432/dbname" value={dsn} onChange={(e) => setDsn(e.target.value)} data-testid="check-dsn-input" />
                <textarea
                  required
                  rows={3}
                  className="rp-input font-mono resize-y"
                  placeholder="SELECT id, email, created_at FROM orders ORDER BY id DESC LIMIT 100"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  data-testid="check-query-input"
                />
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Read-only: must start with <span className="font-mono">SELECT</span> or <span className="font-mono">WITH</span>, single statement, no <span className="font-mono">INSERT</span>/<span className="font-mono">UPDATE</span>/<span className="font-mono">DELETE</span>/<span className="font-mono">DROP</span>. VerifyRuns caps results at 100 rows.
                </p>
              </div>
            )}
          </Section>

          <Section title="Expectations" subtitle="All optional. VerifyRuns will use these to decide PASS or FAIL.">
            <div className="mb-3">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Growth mode</label>
              <select className="rp-input font-mono" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="check-mode-select">
                <option value="growth">Growth — must gain at least the minimum (or what the workflow claims)</option>
                <option value="steady">Steady — the count must not change</option>
                <option value="claimed">Claimed — every run must send {"{"}"wrote": N{"}"} and the destination must gain N</option>
              </select>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Minimum new records per run (0 = growth optional)</label>
                <input type="number" min="0" className="rp-input font-mono" value={minNew} onChange={(e) => setMinNew(e.target.value)} data-testid="check-minnew-input" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Required fields (comma-separated)</label>
                <input type="text" className="rp-input font-mono" placeholder="id, price, created_at" value={required} onChange={(e) => setRequired(e.target.value)} data-testid="check-required-input" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Fields that must be non-empty</label>
              <input type="text" className="rp-input font-mono" placeholder="email, customer_id" value={nonEmpty} onChange={(e) => setNonEmpty(e.target.value)} data-testid="check-nonempty-input" />
            </div>
          </Section>

          <Section title="Alert channel" subtitle="Optional. VerifyRuns will POST a message here when a run FAILs and again when it recovers.">
            <input
              type="url"
              className="rp-input font-mono"
              placeholder="Slack incoming webhook URL (https://hooks.slack.com/services/...)"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              data-testid="check-slack-input"
            />
            <p className="text-xs text-zinc-500 leading-relaxed mt-2">
              Stored encrypted; only the last 4 characters are shown afterwards.
            </p>
            <label className="flex items-center gap-2 mt-4 cursor-pointer select-none" data-testid="retry-toggle-label">
              <input
                type="checkbox"
                className="w-4 h-4 accent-emerald-500"
                checked={retryBeforeAlert}
                onChange={(e) => setRetryBeforeAlert(e.target.checked)}
                data-testid="check-retry-toggle"
              />
              <span className="text-sm text-zinc-300">Retry 30s before alerting</span>
              <span className="text-xs text-zinc-500">— swallows flaky destinations. Turn off for instant alerts.</span>
            </label>
          </Section>

          {error && <div className="text-sm text-red-400 border border-red-500/25 bg-red-500/5 rounded-md p-3" data-testid="new-check-error">{error}</div>}

          <div className="flex gap-3">
            <button type="submit" className="rp-btn-primary" disabled={busy} data-testid="create-check-submit">
              {busy ? "Creating…" : "Create check"}
            </button>
            <Link to="/dashboard" className="rp-btn-ghost" data-testid="cancel-new-check">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <p className="font-display text-lg mb-1">{title}</p>
      {subtitle && <p className="text-sm text-zinc-500 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function ConnectorOption({ active, onClick, title, sub, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`text-left p-4 rounded-lg border transition-colors ${active ? "border-emerald-500/50 bg-emerald-500/5" : "border-[#27272A] bg-[#0A0A0A] hover:border-[#3F3F46]"}`}
    >
      <p className={`font-display text-sm mb-1 ${active ? "text-emerald-300" : "text-zinc-200"}`}>{title}</p>
      <p className="text-xs text-zinc-500">{sub}</p>
    </button>
  );
}
