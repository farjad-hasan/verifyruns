import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatError } from "../lib/api";
import { useAuth } from "../lib/auth";
import Nav from "../components/Nav";
import { toast } from "sonner";

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/reset", { token, password });
      localStorage.setItem("rp_token", data.token);
      await refresh();
      toast.success("Password updated");
      nav("/dashboard", { replace: true });
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
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-2">Choose a new password</h1>
          {!token ? (
            <p className="text-zinc-400 mb-10" data-testid="reset-no-token">
              This page needs the link from the reset email. <Link to="/forgot" className="text-zinc-200 underline underline-offset-4 hover:text-white">Request a new one</Link>.
            </p>
          ) : (
            <>
              <p className="text-zinc-400 mb-10">At least 6 characters. You'll be signed in when it's saved.</p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-quiet block mb-2">New password</label>
                  <input type="password" required minLength={6} autoComplete="new-password" className="rp-input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="reset-password-input" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-quiet block mb-2">Again</label>
                  <input type="password" required minLength={6} autoComplete="new-password" className="rp-input font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="reset-confirm-input" />
                </div>
                {error && (
                  <div className="text-sm text-red-400 border border-red-500/25 bg-red-500/5 rounded-md p-3" data-testid="reset-error">
                    {error} {/expired/i.test(error) && <Link to="/forgot" className="underline underline-offset-4">Request a new link</Link>}
                  </div>
                )}
                <button type="submit" className="rp-btn-primary w-full justify-center" disabled={busy} data-testid="reset-submit-btn">
                  {busy ? "Saving…" : "Save password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
