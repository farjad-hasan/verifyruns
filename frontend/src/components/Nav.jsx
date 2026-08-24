import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Activity, LogOut } from "lucide-react";

export default function Nav() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const onLogout = () => { nav("/", { replace: true }); logout(); };

  return (
    <header className="border-b border-[#18181B] bg-[#0A0A0A]/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2.5" data-testid="nav-logo">
          <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Activity size={15} className="text-emerald-400" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">VerifyRuns</span>
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-zinc-400 hidden sm:inline" data-testid="nav-user-email">{user.email}</span>
              <button className="rp-btn-ghost" onClick={onLogout} data-testid="nav-logout-btn">
                <LogOut size={14} /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rp-link text-sm" data-testid="nav-login-link">Log in</Link>
              <Link to="/signup" className="rp-btn-primary" data-testid="nav-signup-btn">Get started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
