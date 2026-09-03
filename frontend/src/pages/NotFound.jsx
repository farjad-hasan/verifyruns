import { Link, useLocation } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";
import { useAuth } from "../lib/auth";

export default function NotFound() {
  useTitle("Page not found");
  const { pathname } = useLocation();
  const { user } = useAuth();
  return (
    <div className="rp-page">
      <Nav />
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md text-center" data-testid="not-found-page">
          <p className="text-xs uppercase tracking-widest text-quiet mb-3">404</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight mb-3">There's nothing at this address.</h1>
          <p className="text-zinc-400 mb-8">
            <code className="font-mono text-sm text-zinc-300">{pathname}</code> doesn't match any page.
          </p>
          <div className="flex items-center justify-center gap-4">
            {user ? (
              <>
                <Link to="/dashboard" className="rp-btn-primary" data-testid="not-found-dashboard-link">Go to dashboard</Link>
                <Link to="/" className="rp-link" data-testid="not-found-home-link">VerifyRuns home</Link>
              </>
            ) : (
              <Link to="/" className="rp-btn-primary" data-testid="not-found-home-link">VerifyRuns home</Link>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
