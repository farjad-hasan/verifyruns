import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatError } from "../lib/api";
import Nav from "../components/Nav";
import useTitle from "../lib/useTitle";

export default function ForgotPage() {
  useTitle("Forgot password");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    api.get("/meta").then(({ data }) => setAvailable(!!data.email_alerts)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rp-fade">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">Password</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-2">Reset your password</h1>
          {!available ? (
            <p className="text-zinc-400 mb-10" data-testid="forgot-unavailable">
              This host has no email sending configured, so it cannot send reset links. Ask whoever runs it to set <code className="font-mono">RESEND_API_KEY</code> and <code className="font-mono">ALERT_FROM</code>.
            </p>
          ) : sent ? (
            <p className="text-zinc-400 mb-10" data-testid="forgot-sent">
              If <span className="font-mono text-zinc-200">{email}</span> has an account, a reset link is on its way. It works once, for one hour. Check spam if it hasn't arrived in a minute.
            </p>
          ) : (
            <>
              <p className="text-zinc-400 mb-10">Enter the email you signed up with. We'll send a link that lets you choose a new password.</p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-quiet block mb-2">Email</label>
                  <input type="email" required autoComplete="email" className="rp-input font-mono" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" data-testid="forgot-email-input" />
                </div>
                {error && <div className="text-sm text-red-400 border border-red-500/25 bg-red-500/5 rounded-md p-3" data-testid="forgot-error">{error}</div>}
                <button type="submit" className="rp-btn-primary w-full justify-center" disabled={busy} data-testid="forgot-submit-btn">
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
          <p className="mt-8 text-sm text-quiet">
            Remembered it? <Link to="/login" className="text-zinc-200 underline underline-offset-4 hover:text-white">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
