import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import NewCheck from "@/pages/NewCheck";
import CheckDetail from "@/pages/CheckDetail";
import PublicStatus from "@/pages/PublicStatus";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><AuthPage mode="signup" /></PublicOnly>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/checks/new" element={<Protected><NewCheck /></Protected>} />
          <Route path="/checks/:id" element={<Protected><CheckDetail /></Protected>} />
          <Route path="/status/:token" element={<PublicStatus />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
