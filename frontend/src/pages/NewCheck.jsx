import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { formatError } from "../lib/api";
import Nav from "../components/Nav";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function NewCheck() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [minNew, setMinNew] = useState(1);
  const [required, setRequired] = useState("");
  const [nonEmpty, setNonEmpty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        name,
        connector_kind: "http_json",
        config: {
          url,
          bearer_token: token || null,
          json_path: jsonPath || null,
        },
        expectations: {
          min_new_records: Number(minNew) || 0,
          required_fields: required.split(",").map((s) => s.trim()).filter(Boolean),
          non_empty_fields: nonEmpty.split(",").map((s) => s.trim()).filter(Boolean),
        },
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
            <input required className="rp-input" placeholder="airtable-orders-sync" value={name} onChange={(e) => setName(e.target.value)} data-testid="check-name-input" />
          </Section>

          <Section title="HTTP / JSON connector" subtitle="VerifyRuns will GET this URL server-side after each run.">
            <div className="space-y-3">
              <input required type="url" className="rp-input font-mono" placeholder="https://api.example.com/v1/orders" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="check-url-input" />
              <input type="text" className="rp-input font-mono" placeholder="Bearer token (optional, encrypted at rest)" value={token} onChange={(e) => setToken(e.target.value)} data-testid="check-token-input" />
              <input type="text" className="rp-input font-mono" placeholder="JSON path to array (optional, e.g. data.records)" value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} data-testid="check-jsonpath-input" />
              <p className="text-xs text-zinc-500 leading-relaxed">Leave the path empty if the response body itself is an array.</p>
            </div>
          </Section>

          <Section title="Expectations" subtitle="All optional. VerifyRuns will use these to decide PASS or FAIL.">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">Minimum new records per run</label>
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
