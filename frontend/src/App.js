import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { safeNext } from "@/lib/nav";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import NewCheck from "@/pages/NewCheck";
import CheckDetail from "@/pages/CheckDetail";
import PublicStatus from "@/pages/PublicStatus";
import Pricing from "@/pages/Pricing";
import DataPage from "@/pages/DataPage";
import SecurityPage from "@/pages/SecurityPage";
import ForgotPage from "@/pages/ForgotPage";
import ResetPage from "@/pages/ResetPage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import NotFound from "@/pages/NotFound";

function Protected({ children }) {
  const { user, ready, expired } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-quiet text-sm">Loading…</div>;
  if (!user) {
    // `expired` distinguishes a session that stopped working from never having logged in; the login
    // page turns it into a sentence, and `next` returns the user here after login either way.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?${expired ? "expired=1&" : ""}next=${next}`} replace />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  const [params] = useSearchParams();
  if (!ready) return null;
  if (user) return <Navigate to={safeNext(params.get("next")) || "/dashboard"} replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><AuthPage mode="signup" /></PublicOnly>} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/checks/new" element={<Protected><NewCheck /></Protected>} />
            <Route path="/checks/:id" element={<Protected><CheckDetail /></Protected>} />
            <Route path="/status/:token" element={<PublicStatus />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/forgot" element={<PublicOnly><ForgotPage /></PublicOnly>} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: { background: "#121214", border: "1px solid #27272A", color: "#FAFAFA", fontFamily: "Manrope, sans-serif" },
        }}
      />
    </AuthProvider>
  );
}
