import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { formatError } from "../lib/api";
import Nav from "../components/Nav";
import { toast } from "sonner";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { login, register } = useAuth();
  const nav = useNavigate();
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
      nav("/dashboard");
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
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">
            {isLogin ? "Welcome back" : "Get started"}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
            {isLogin ? "Log in to RunProof" : "Create your account"}
          </h1>
          <p className="text-zinc-400 mb-10">
            {isLogin ? "Pick up where you left off." : "No credit card. Add your first check in minutes."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500 block mb-2">Email</label>
              <input
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
              <label className="text-xs uppercase tracking-wider text-zinc-500 block mb-2">Password</label>
              <input
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
          </form>

          <p className="mt-8 text-sm text-zinc-500">
            {isLogin ? "New to RunProof? " : "Already have an account? "}
            <Link to={isLogin ? "/signup" : "/login"} className="text-zinc-200 underline underline-offset-4 hover:text-white" data-testid="auth-switch-link">
              {isLogin ? "Create an account" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
