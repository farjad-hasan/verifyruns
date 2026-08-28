import { Env } from "./env";
import { HttpError, json } from "./http";
import * as r from "./routes";

type Handler = (env: Env, request: Request, ctx: ExecutionContext, params: Record<string, string>) => Promise<Response> | Response;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/\{(\w+)\}/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
  routes.push({ method, pattern, keys, handler });
}

route("GET", "/api", () => json({ app: "VerifyRuns", ok: true }));
route("POST", "/api/auth/register", (env, req) => r.register(env, req));
route("POST", "/api/auth/login", (env, req) => r.login(env, req));
route("GET", "/api/auth/me", (env, req) => r.me(env, req));
route("DELETE", "/api/auth/me", (env, req) => r.deleteMe(env, req));
route("POST", "/api/checks", (env, req) => r.createCheck(env, req));
route("GET", "/api/checks", (env, req) => r.listChecks(env, req));
route("GET", "/api/checks/{id}", (env, req, _c, p) => r.getCheckRoute(env, req, p.id));
route("PATCH", "/api/checks/{id}", (env, req, _c, p) => r.patchCheck(env, req, p.id));
route("DELETE", "/api/checks/{id}", (env, req, _c, p) => r.deleteCheck(env, req, p.id));
route("POST", "/api/checks/{id}/snooze", (env, req, _c, p) => r.snooze(env, req, p.id));
route("DELETE", "/api/checks/{id}/snooze", (env, req, _c, p) => r.wake(env, req, p.id));
route("POST", "/api/checks/{id}/public", (env, req, _c, p) => r.enablePublic(env, req, p.id));
route("DELETE", "/api/checks/{id}/public", (env, req, _c, p) => r.disablePublic(env, req, p.id));
route("GET", "/api/public/checks/{token}", (env, _req, _c, p) => r.publicCheck(env, p.token));
route("POST", "/api/checks/{id}/channels", (env, req, _c, p) => r.addChannel(env, req, p.id));
route("DELETE", "/api/checks/{id}/channels/{channelId}", (env, req, _c, p) => r.deleteChannel(env, req, p.id, p.channelId));
route("GET", "/api/checks/{id}/runs", (env, req, _c, p) => r.listRuns(env, req, p.id));
route("GET", "/api/runs/{runId}", (env, req, _c, p) => r.getRun(env, req, p.runId));
route("POST", "/api/hook/{secret}", (env, req, ctx, p) => r.webhook(env, req, ctx, p.secret));
route("POST", "/api/checks/{id}/run", (env, req, ctx, p) => r.runNow(env, req, ctx, p.id));
route("GET", "/api/meta", (env) => r.meta(env));
route("GET", "/api/plans", (env) => r.plans(env));
route("POST", "/api/interest", (env, req) => r.interest(env, req));

export function addRoute(method: string, path: string, handler: Handler): void {
  route(method, path, handler);
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.CORS_ORIGINS || "*").split(",").map((s) => s.trim());
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-tick-secret",
    "access-control-allow-credentials": "true",
    vary: "origin",
  };
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  for (const rt of routes) {
    if (rt.method !== request.method) continue;
    const m = path.match(rt.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    rt.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return rt.handler(env, request, ctx, params);
  }
  if (routes.some((rt) => path.match(rt.pattern))) throw new HttpError(405, "Method Not Allowed");
  throw new HttpError(404, "Not Found");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      res = await handle(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) res = json({ detail: e.detail }, e.status, e.headers);
      else {
        console.error("unhandled", e);
        res = json({ detail: "Internal Server Error" }, 500);
      }
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },

  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Stage C wires the tick here.
  },
} satisfies ExportedHandler<Env>;
