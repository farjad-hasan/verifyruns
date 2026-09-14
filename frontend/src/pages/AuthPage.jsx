import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatError } from "../lib/api";
import { safeNext } from "../lib/nav";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";
import { toast } from "sonner";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  useTitle(isLogin ? "Log in" : "Sign up");
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessionExpired = params.get("expired") === "1";
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLogin) await login(email, password);
      else await register(email, password);
      toast.success(isLogin ? "Welcome back" : "Account created");
      nav(next || "/dashboard");
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-page">
      <Nav />
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rp-fade">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">
            {isLogin ? "Welcome back" : "Get started"}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
            {isLogin ? "Log in to VerifyRuns" : "Create your account"}
          </h1>
          <p className="text-zinc-400 mb-10">
            {isLogin ? "Pick up where you left off." : "No credit card. Start with one workflow and a destination baseline."}
          </p>

          {sessionExpired && (
            <div className="text-sm text-zinc-300 border border-zinc-700 bg-zinc-900/60 rounded-md p-3 mb-6" data-testid="auth-expired-note">
              Signed out — your session expired.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="text-xs uppercase tracking-wider text-quiet block mb-2">Email</label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                className="rp-input font-mono"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                data-testid="auth-email-input"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="text-xs uppercase tracking-wider text-quiet block mb-2">Password</label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="rp-input font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                data-testid="auth-password-input"
              />
            </div>
            {error && (
              <div className="text-sm text-red-400 border border-red-500/25 bg-red-500/5 rounded-md p-3" data-testid="auth-error">
                {error}
              </div>
            )}
            <button type="submit" className="rp-btn-primary w-full justify-center" disabled={busy} data-testid="auth-submit-btn">
              {busy ? "Working…" : isLogin ? "Log in" : "Create account"}
            </button>
            {isLogin ? null : (
              <p className="text-xs text-quiet leading-relaxed" data-testid="auth-terms-note">
                By creating an account you agree to the <Link to="/terms" className="rp-inline">Terms</Link> and the <Link to="/privacy" className="rp-inline">Privacy Policy</Link>.
              </p>
            )}
          </form>

          <p className="mt-8 text-sm text-quiet">
            {isLogin ? "New to VerifyRuns? " : "Already have an account? "}
            <Link to={`${isLogin ? "/signup" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-zinc-200 rp-inline" data-testid="auth-switch-link">
              {isLogin ? "Create an account" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
