import { Link } from "react-router-dom";
import { Activity } from "lucide-react";

// The one footer every route renders (app-shell spec, "One footer and one nav on every route").
// It sits in the nav's container width because nav and footer are site chrome; the content
// columns between them vary per page. `mt-auto` needs the page root to be `flex flex-col`.
const LINKS = [
  ["/pricing", "Pricing", "footer-pricing"],
  ["/data", "What we store", "footer-data"],
  ["/security", "Security", "footer-security"],
  ["/privacy", "Privacy", "footer-privacy"],
  ["/terms", "Terms", "footer-terms"],
  ["/setup", "Setup guide", "footer-setup"],
];

export default function Footer({ slim = false }) {
  if (slim) {
    return (
      <footer className="border-t border-raised mt-auto" data-testid="footer">
        <p className="max-w-6xl mx-auto px-6 lg:px-10 py-8 text-xs text-quiet text-center">
          Read-only status page powered by <Link to="/" className="rp-inline" data-testid="footer-home">VerifyRuns</Link> ·{" "}
          <Link to="/privacy" className="rp-inline" data-testid="footer-privacy">Privacy</Link> ·{" "}
          <Link to="/terms" className="rp-inline" data-testid="footer-terms">Terms</Link>
        </p>
      </footer>
    );
  }
  return (
    <footer className="border-t border-raised mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8 text-sm text-quiet flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 text-zinc-300 hover:text-zinc-100 transition-colors" data-testid="footer-logo">
          <span className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 inline-flex items-center justify-center">
            <Activity size={13} className="text-emerald-400" strokeWidth={2.5} />
          </span>
          <span className="font-display font-semibold tracking-tight">VerifyRuns</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-5" aria-label="Site">
          {LINKS.map(([to, label, testid]) => (
            <Link key={to} to={to} className="rp-link" data-testid={testid}>{label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
