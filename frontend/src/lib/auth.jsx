import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out, obj=logged in
  const [ready, setReady] = useState(false);

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
    } catch {
      localStorage.removeItem("rp_token");
      setUser(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("rp_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const register = async (email, password) => {
    const { data } = await api.post("/auth/register", { email, password });
    localStorage.setItem("rp_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const logout = () => {
    localStorage.removeItem("rp_token");
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
