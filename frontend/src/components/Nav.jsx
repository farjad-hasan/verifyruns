import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Activity, LogOut, Trash2 } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

// `variant="public"` is the header of the read-only status page: logo and a label, no account
// controls. The logged-out nav also drops the link to the route it is on.
export default function Nav({ variant = "app" }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const pathname = useLocation().pathname.replace(/\/+$/, "") || "/"; // "/login/" is the login page too
  const onLogout = () => { nav("/", { replace: true }); logout(); };
  const onDeleteAccount = async () => {
    if (!window.confirm("Delete your account? This removes every Check, run, stored sample and pricing note. There is no undo.")) return;
    try {
      await api.delete("/auth/me");
      toast.success("Account deleted");
      onLogout();
    } catch {
      toast.error("Could not delete the account");
    }
  };

  return (
    <header className="border-b border-raised bg-ink/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
        <Link to={user && variant !== "public" ? "/dashboard" : "/"} className="flex items-center gap-2.5" data-testid="nav-logo">
          <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Activity size={15} className="text-emerald-400" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">VerifyRuns</span>
        </Link>
        {variant === "public" ? (
          <span className="text-[11px] uppercase tracking-widest text-quiet font-mono">Public status</span>
        ) : (
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-zinc-400 hidden sm:inline" data-testid="nav-user-email">{user.email}</span>
              <button className="rp-btn-ghost" onClick={onLogout} data-testid="nav-logout-btn">
                <LogOut size={14} /> Sign out
              </button>
              <button className="rp-link text-quiet hover:text-red-400 inline-flex items-center justify-center w-11 h-11 -mr-3" onClick={onDeleteAccount} title="Delete account and all data" aria-label="Delete account and all data" data-testid="nav-delete-account-btn">
                <Trash2 size={13} />
              </button>
            </>
          ) : (
            <>
              {pathname !== "/login" && <Link to="/login" className="rp-link text-sm" data-testid="nav-login-link">Log in</Link>}
              {pathname !== "/signup" && <Link to="/signup" className="rp-btn-primary" data-testid="nav-signup-btn">Get started</Link>}
            </>
          )}
        </nav>
        )}
      </div>
    </header>
  );
}
