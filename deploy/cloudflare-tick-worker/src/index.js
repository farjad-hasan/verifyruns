// Ticks VerifyRuns: runs missed-heartbeat checks, queued webhook runs and due retries.
// Also keeps a sleeping free-tier API awake, since it is a request every minute.
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
  // Optional manual trigger: GET the Worker URL with ?secret=<TICK_SECRET> to tick now.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("secret") !== env.TICK_SECRET) return new Response("no", { status: 401 });
    const res = await tick(env);
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  },
};

async function tick(env) {
  const res = await fetch(env.TICK_URL, {
    method: "POST",
    headers: { "X-Tick-Secret": env.TICK_SECRET, "user-agent": "verifyruns-tick-worker" },
  });
  if (!res.ok) console.log(`tick failed: ${res.status} ${await res.text()}`);
  return res;
}
