import { createContext, useContext, useEffect, useState, useCallback } from "react";
import posthog from "posthog-js";
import api from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out, obj=logged in
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false); // a held token stopped working (vs never logged in)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("rp_token");
    if (!token) {
      setUser(false);
      setReady(true);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      setExpired(false);
    } catch (e) {
      // A 401 already dropped the token via the interceptor; on a public route this resolves to
      // "logged out" with no navigation — the page keeps rendering.
      if (e?.response?.status === 401) setExpired(true);
      localStorage.removeItem("rp_token");
      setUser(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // The api interceptor announces a dead token from any request (e.g. a dashboard poll mid-session).
  useEffect(() => {
    const onUnauthorized = () => {
      setExpired(true);
      setUser(false);
      setReady(true);
    };
    window.addEventListener("rp:unauthorized", onUnauthorized);
    return () => window.removeEventListener("rp:unauthorized", onUnauthorized);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("rp_token", data.token);
    setUser(data.user);
    if (posthog.__loaded) posthog.identify(data.user.id, { email: data.user.email });
    return data.user;
  };
  const register = async (email, password) => {
    const { data } = await api.post("/auth/register", { email, password });
    localStorage.setItem("rp_token", data.token);
    setUser(data.user);
    if (posthog.__loaded) {
      posthog.identify(data.user.id, { email: data.user.email });
      posthog.capture("signup");
    }
    return data.user;
  };
  const logout = () => {
    localStorage.removeItem("rp_token");
    setUser(false);
    if (posthog.__loaded) posthog.reset();
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
