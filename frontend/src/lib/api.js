import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

client.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("rp_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    // No navigation here: whether a 401 means "go to login" depends on the ROUTE, and only the
    // router knows that. Drop the dead token and tell AuthProvider; Protected routes then redirect
    // with the expiry reason, public routes (status pages, /reset, marketing) keep rendering.
    if (err?.response?.status === 401 && localStorage.getItem("rp_token")) {
      localStorage.removeItem("rp_token");
      window.dispatchEvent(new Event("rp:unauthorized"));
    }
    return Promise.reject(err);
  }
);

export function formatError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (typeof detail === "object" && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default client;
