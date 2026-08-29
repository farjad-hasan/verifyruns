import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { formatError } from "../lib/api";
import Nav from "../components/Nav";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

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
  const [alertKind, setAlertKind] = useState("slack");
  const [retryBeforeAlert, setRetryBeforeAlert] = useState(true);
  const [heartbeatHours, setHeartbeatHours] = useState("");
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
        alert_channels: slackWebhook.trim() ? [{ kind: alertKind, target: slackWebhook.trim() }] : [],
        retry_before_alert: retryBeforeAlert,
        heartbeat_hours: heartbeatHours === "" ? null : Number(heartbeatHours),
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
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-10">Create a check</h1>

        <form onSubmit={submit} className="space-y-10">
          <Section title="Name">
            <input required className="rp-input" placeholder="orders-sync" value={name} onChange={(e) => setName(e.target.value)} data-testid="check-name-input" />
          </Section>

          <Section title="Destination" subtitle="Pick the connector VerifyRuns should re-read after each run.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
              <div className="space-y-4">
                <Field id="check-url" label="GET URL">
                  <input id="check-url" required type="url" className="rp-input font-mono" placeholder="https://api.example.com/v1/orders" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="check-url-input" />
                </Field>
                <Field id="check-token" label="Bearer token" optional hint="Encrypted at rest; shown masked afterwards.">
                  <SecretInput id="check-token" placeholder="eyJhbGciOi…" value={token} onChange={setToken} testid="check-token-input" />
                </Field>
                <Field id="check-jsonpath" label="JSON path to the array" optional hint="Leave empty if the response body itself is an array.">
                  <input id="check-jsonpath" type="text" className="rp-input font-mono" placeholder="data.records" value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} data-testid="check-jsonpath-input" />
                </Field>
                <Field id="check-newestkey" label="Newest-record key" optional hint="A field that grows with time, e.g. created_at. Without one, the last element counts as newest.">
                  <input id="check-newestkey" type="text" className="rp-input font-mono" placeholder="created_at" value={newestKey} onChange={(e) => setNewestKey(e.target.value)} data-testid="check-newestkey-input" />
                </Field>
              </div>
            )}

            {kind === "airtable" && (
              <div className="space-y-4">
                <Field id="check-base-id" label="Base ID">
                  <input id="check-base-id" required type="text" className="rp-input font-mono" placeholder="appXXXXXXXXXXXXXX" value={baseId} onChange={(e) => setBaseId(e.target.value)} data-testid="check-base-id-input" />
                </Field>
                <Field id="check-table" label="Table name">
                  <input id="check-table" required type="text" className="rp-input font-mono" placeholder="Orders" value={table} onChange={(e) => setTable(e.target.value)} data-testid="check-table-input" />
                </Field>
                <Field id="check-pat" label="Personal access token" hint="Encrypted at rest; shown masked afterwards.">
                  <SecretInput id="check-pat" required placeholder="pat…" value={pat} onChange={setPat} testid="check-pat-input" />
                </Field>
                <Field id="check-view" label="View name" optional>
                  <input id="check-view" type="text" className="rp-input font-mono" placeholder="Grid view" value={view} onChange={(e) => setView(e.target.value)} data-testid="check-view-input" />
                </Field>
                <p className="text-xs text-quiet leading-relaxed">
                  VerifyRuns lists up to 100 records at a time. Create a PAT at
                  <a className="underline underline-offset-4 hover:text-zinc-300 ml-1" href="https://airtable.com/create/tokens" target="_blank" rel="noreferrer">airtable.com/create/tokens</a>
                  &nbsp;with <span className="font-mono">data.records:read</span> for the base.
                </p>
              </div>
            )}

            {kind === "postgres" && (
              <div className="space-y-4">
                <Field id="check-dsn" label="Connection string" hint="Encrypted at rest; shown masked afterwards.">
                  <SecretInput id="check-dsn" required placeholder="postgres://user:pass@host:5432/dbname" value={dsn} onChange={setDsn} testid="check-dsn-input" />
                </Field>
                <Field id="check-query" label="Read-only query">
                  <textarea
                    id="check-query"
                    required
                    rows={3}
                    className="rp-input font-mono resize-y"
                    placeholder="SELECT id, email, created_at FROM orders ORDER BY id DESC LIMIT 100"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="check-query-input"
                  />
                </Field>
                <p className="text-xs text-quiet leading-relaxed">
                  Read-only: must start with <span className="font-mono">SELECT</span> or <span className="font-mono">WITH</span>, single statement, no <span className="font-mono">INSERT</span>/<span className="font-mono">UPDATE</span>/<span className="font-mono">DELETE</span>/<span className="font-mono">DROP</span>. VerifyRuns caps results at 100 rows.
                </p>
              </div>
            )}
          </Section>

          <Section title="Expectations" subtitle="All optional. VerifyRuns will use these to decide PASS or FAIL.">
            <div className="mb-3">
              <label htmlFor="check-mode" className="text-[11px] uppercase tracking-wider text-quiet block mb-2">Growth mode</label>
              <select id="check-mode" className="rp-input font-mono" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="check-mode-select">
                <option value="growth">Growth</option>
                <option value="steady">Steady</option>
                <option value="claimed">Claimed</option>
              </select>
              <p className="text-xs text-quiet mt-2 leading-relaxed">{MODE_HINT[mode]}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="check-minnew" className="text-[11px] uppercase tracking-wider text-quiet block mb-2">Minimum new records per run (0 = growth optional)</label>
                <input id="check-minnew" type="number" min="0" className="rp-input font-mono" value={minNew} onChange={(e) => setMinNew(e.target.value)} data-testid="check-minnew-input" />
              </div>
              <div>
                <label htmlFor="check-required" className="text-[11px] uppercase tracking-wider text-quiet block mb-2">Required fields (comma-separated)</label>
                <input id="check-required" type="text" className="rp-input font-mono" placeholder="id, price, created_at" value={required} onChange={(e) => setRequired(e.target.value)} data-testid="check-required-input" />
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="check-nonempty" className="text-[11px] uppercase tracking-wider text-quiet block mb-2">Fields that must be non-empty</label>
              <input id="check-nonempty" type="text" className="rp-input font-mono" placeholder="email, customer_id" value={nonEmpty} onChange={(e) => setNonEmpty(e.target.value)} data-testid="check-nonempty-input" />
            </div>
          </Section>

          <Section title="Heartbeat" subtitle="Optional. Catch the workflow that never ran: if no run arrives within this many hours, VerifyRuns records a FAIL and alerts.">
            <label htmlFor="check-heartbeat" className="text-[11px] uppercase tracking-wider text-quiet block mb-2">Expect a run every … hours (blank = off)</label>
            <input id="check-heartbeat" type="number" min="1" max="720" className="rp-input font-mono" placeholder="24" value={heartbeatHours} onChange={(e) => setHeartbeatHours(e.target.value)} data-testid="check-heartbeat-input" />
            <p className="text-xs text-quiet mt-2">Pick a little longer than your workflow's longest normal gap — a daily job wants 26–30, not 24.</p>
          </Section>

          <Section title="Alert channel" subtitle="Optional. VerifyRuns will POST a message here when a run FAILs and again when it recovers.">
            <label htmlFor="check-alert-target" className="text-[11px] uppercase tracking-wider text-quiet block mb-2">Webhook URL <span className="normal-case tracking-normal text-quiet/80">(optional)</span></label>
            <div className="grid sm:grid-cols-[140px_1fr] gap-2">
              <select className="rp-input font-mono" aria-label="Alert channel kind" value={alertKind} onChange={(e) => setAlertKind(e.target.value)} data-testid="check-alert-kind">
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
              </select>
              <input
                id="check-alert-target"
                type="url"
                className="rp-input font-mono"
                placeholder={alertKind === "discord" ? "Discord webhook URL (https://discord.com/api/webhooks/...)" : "Slack incoming webhook URL (https://hooks.slack.com/services/...)"}
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                data-testid="check-slack-input"
              />
            </div>
            <p className="text-xs text-quiet mt-2">Email and more channels can be added from the check page.</p>
            <p className="text-xs text-quiet leading-relaxed mt-2">
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
              <span className="text-xs text-quiet">— swallows flaky destinations. Turn off for instant alerts.</span>
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

const MODE_HINT = {
  growth: "The destination must gain at least the minimum below, or at least what the workflow claimed with {\"wrote\": N}.",
  steady: "The count must not change between runs — for lookup tables and config rows.",
  claimed: "Every run must send {\"wrote\": N} and the destination must gain exactly that many.",
};

function Field({ id, label, optional = false, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] uppercase tracking-wider text-quiet block mb-2">
        {label}
        {optional && <span className="normal-case tracking-normal text-quiet/80"> (optional)</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-quiet leading-relaxed mt-1.5">{hint}</p>}
    </div>
  );
}

function SecretInput({ id, value, onChange, placeholder, required = false, testid }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        required={required}
        type={show ? "text" : "password"}
        autoComplete="off"
        className="rp-input font-mono pr-11"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-0 top-0 h-full w-11 inline-flex items-center justify-center text-quiet hover:text-zinc-200"
        aria-label={show ? "Hide value" : "Show value"}
        aria-pressed={show}
        data-testid={`${testid}-reveal`}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div>
      <p className="font-display text-lg mb-1">{title}</p>
      {subtitle && <p className="text-sm text-quiet mb-4">{subtitle}</p>}
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
      className={`text-left p-4 rounded-lg border transition-colors ${active ? "border-emerald-500/50 bg-emerald-500/5" : "border-hairline bg-ink hover:border-hairline-hover"}`}
    >
      <p className={`font-display text-sm mb-1 ${active ? "text-emerald-300" : "text-zinc-200"}`}>{title}</p>
      <p className="text-xs text-quiet">{sub}</p>
    </button>
  );
}
