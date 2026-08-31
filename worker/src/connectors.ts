/** Destination readers: HTTP/JSON, Airtable, Postgres. Each returns a newest-first sample plus a true count. */
import { decryptSecret } from "./crypto";
import { egressViolation } from "./egress";
import { FetchMeta, hasOrderBy, sortDesc } from "./engine";
import { Env, flag, num } from "./env";
import { httpFetch, readCapped } from "./net";
import pg from "./vendor/pg.mjs";

export interface FetchResult {
  records: Record<string, any>[] | null;
  meta: FetchMeta | null;
  error: string | null;
  details: string | null;
}

const fail = (error: string, details: string | null = null): FetchResult => ({ records: null, meta: null, error, details });
const meta = (total: number, extra: Partial<FetchMeta> = {}): FetchMeta => ({ total, capped: false, count_estimated: false, newest_defined: true, ...extra });

export const AIRTABLE_PAGE_SIZE = 100;
export const PG_SAMPLE_LIMIT = 100;
const HTTP_TIMEOUT_MS = 20_000;

function getRecords(payload: unknown, jsonPath: string | null): Record<string, any>[] | null {
  let node: any = payload;
  if (jsonPath) {
    for (const raw of jsonPath.split(".")) {
      const part = raw.trim();
      if (!part) continue;
      if (node && typeof node === "object" && !Array.isArray(node) && part in node) node = node[part];
      else return null;
    }
  }
  if (!Array.isArray(node)) return null;
  return node.filter((x) => x && typeof x === "object" && !Array.isArray(x));
}

const CREDENTIAL_UNREADABLE = "Stored credential could not be read; re-enter it on the Check.";

export async function fetchRecords(env: Env, kind: string, cfg: Record<string, any>): Promise<FetchResult> {
  const allowPrivate = flag(env.VR_ALLOW_PRIVATE_EGRESS, false);
  const maxBytes = num(env.VR_MAX_RESPONSE_BYTES, 5 * 1024 * 1024);

  if (kind === "http_json") {
    const url: string = cfg.url || "";
    const v = egressViolation(url, allowPrivate);
    if (v) return fail(v);
    const headers: Record<string, string> = {};
    if (cfg.bearer_token_encrypted) {
      const plain = await decryptSecret(env.ENC_KEY, cfg.bearer_token_encrypted);
      if (plain === null) return fail(CREDENTIAL_UNREADABLE);
      if (plain) headers.authorization = `Bearer ${plain}`;
    }
    let resp: Response;
    try {
      resp = await httpFetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    } catch (e: any) {
      return fail(`Destination fetch error: ${e?.name || "Error"}.`, String(e?.message || e).slice(0, 500));
    }
    if (resp.status >= 400) {
      const body = await resp.text().catch(() => "");
      return fail(`Destination fetch failed with HTTP ${resp.status}.`, body.slice(0, 500));
    }
    const raw = await readCapped(resp, maxBytes);
    if (raw === null) return fail(`Destination response exceeded ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return fail("Destination did not return valid JSON.");
    }
    const records = getRecords(body, cfg.json_path || null);
    if (records === null) return fail(`Could not find an array of records at path \`${cfg.json_path || "(root)"}\`.`);
    const newestKey: string | null = cfg.newest_key || null;
    const ordered = newestKey ? sortDesc(records, newestKey) : [...records].reverse();
    return { records: ordered, meta: meta(records.length), error: null, details: null };
  }

  if (kind === "airtable") {
    const maxPages = Math.max(1, num(env.VR_AIRTABLE_MAX_PAGES, 40));
    const headers: Record<string, string> = {};
    if (cfg.pat_encrypted) {
      const plain = await decryptSecret(env.ENC_KEY, cfg.pat_encrypted);
      if (plain === null) return fail(CREDENTIAL_UNREADABLE);
      if (plain) headers.authorization = `Bearer ${plain}`;
    }
    const base = `https://api.airtable.com/v0/${cfg.base_id}/${encodeURIComponent(cfg.table)}`;
    const flatten = (r: any) => ({ id: r.id, createdTime: r.createdTime, ...(r.fields && typeof r.fields === "object" ? r.fields : {}) });
    const sample: Record<string, any>[] = [];
    const seen: { created: string; id: string }[] = [];
    let countField: string | null = null;
    let capped = false;
    let offset: string | null = null;
    let page = 0;
    for (;;) {
      const params = new URLSearchParams({ pageSize: String(AIRTABLE_PAGE_SIZE) });
      if (cfg.view) params.set("view", cfg.view);
      if (offset) params.set("offset", offset);
      if (page > 0 && countField) params.append("fields[]", countField);
      let resp: Response;
      try {
        resp = await httpFetch(`${base}?${params}`, { headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
      } catch (e: any) {
        return fail(`Airtable fetch error: ${e?.name || "Error"}.`, String(e?.message || e).slice(0, 500));
      }
      if (resp.status >= 400) return fail(`Airtable fetch failed with HTTP ${resp.status}.`, (await resp.text().catch(() => "")).slice(0, 500));
      let body: any;
      try {
        body = await resp.json();
      } catch {
        return fail("Airtable did not return valid JSON.");
      }
      const raw = body && typeof body === "object" ? body.records : null;
      if (!Array.isArray(raw)) return fail("Airtable response is missing the `records` array.");
      for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        seen.push({ created: r.createdTime || "", id: r.id });
        if (page === 0) {
          sample.push(flatten(r));
          if (countField === null && r.fields && typeof r.fields === "object") {
            const k = Object.keys(r.fields)[0];
            if (k) countField = k;
          }
        }
      }
      offset = body.offset || null;
      page += 1;
      if (!offset) break;
      if (page >= maxPages) {
        capped = true;
        break;
      }
    }
    const newest = seen.reduce<{ created: string; id: string } | null>((best, cur) => (!best || cur.created > best.created ? cur : best), null);
    if (newest && !sample.some((r) => r.id === newest.id)) {
      try {
        const one = await httpFetch(`${base}/${encodeURIComponent(newest.id)}`, { headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
        if (one.status < 400) sample.unshift(flatten(await one.json()));
      } catch {
        /* the sample simply lacks it */
      }
    }
    return { records: sortDesc(sample, "createdTime"), meta: meta(seen.length, { capped }), error: null, details: null };
  }

  if (kind === "postgres") {
    if (!cfg.dsn_encrypted || !cfg.query) return fail("Postgres config is missing DSN or query.");
    const dsn = await decryptSecret(env.ENC_KEY, cfg.dsn_encrypted);
    if (dsn === null) return fail(CREDENTIAL_UNREADABLE);
    const v = egressViolation(dsn, allowPrivate);
    if (v) return fail(v);
    const query: string = cfg.query;
    const countTimeout = num(env.VR_PG_COUNT_TIMEOUT_MS, 15000);
    const sampleTimeout = num(env.VR_PG_SAMPLE_TIMEOUT_MS, 15000);
    const connectTimeout = num(env.VR_PG_CONNECT_TIMEOUT_MS, 15000);
    const tls = !/[?&]sslmode=disable(&|$)/.test(dsn);
    // One attempt, no reconnects: pg-cloudflare's socket fails in under a second when workerd rejects
    // the TLS handshake, whereas a reconnecting driver burns the subrequest budget first.
    const client = new pg.Client({ connectionString: dsn, ssl: tls ? { rejectUnauthorized: true } : false, connectionTimeoutMillis: connectTimeout });
    // pg's own connectionTimeoutMillis does not fire through the Workers socket when the peer never
    // answers (refused port, black hole), so the attempt is raced against the same budget here.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        client.connect(),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(Object.assign(new Error(`no answer from the database within ${Math.round(connectTimeout / 1000)} s`), { code: "TIMEOUT" })), connectTimeout);
        }),
      ]);
    } catch (e: any) {
      client.end().catch(() => {});
      const d = describePgError(e, tls);
      return fail(d.error, d.details);
    } finally {
      if (timer) clearTimeout(timer);
    }
    let total: number | null = null;
    let countEstimated = false;
    let rows: any[];
    try {
      await client.query("SET default_transaction_read_only = on");
      await client.query(`SET statement_timeout = ${Math.floor(countTimeout)}`);
      try {
        const c = await client.query(`SELECT COUNT(*) AS n FROM (${query}) AS _vr`);
        total = Number(c.rows[0]?.n ?? 0);
      } catch (e: any) {
        if (String(e?.code) === "57014") countEstimated = true;
        else throw e;
      }
      await client.query(`SET statement_timeout = ${Math.floor(sampleTimeout)}`);
      rows = (await client.query(`SELECT * FROM (${query}) AS _vr LIMIT ${PG_SAMPLE_LIMIT}`)).rows;
    } catch (e: any) {
      await client.end().catch(() => {});
      if (e?.code) return fail(`Postgres query failed: PostgresError ${e.code}.`, String(e?.message || e).slice(0, 500));
      const d = describePgError(e, tls);
      return fail(d.error, d.details);
    }
    await client.end().catch(() => {});
    const flat = rows.map((r: any) => {
      const row: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) row[k] = v === null || ["string", "number", "boolean"].includes(typeof v) ? v : String(v);
      return row;
    });
    if (total === null) total = flat.length;
    return { records: flat, meta: meta(total, { count_estimated: countEstimated, newest_defined: hasOrderBy(query) }), error: null, details: null };
  }

  return fail(`Unknown connector kind: ${kind}`);
}

/** Map a driver/socket error to the run message. Pure, so the wording is testable without a database. */
export function describePgError(e: any, tls: boolean): { error: string; details: string } {
  const msg = String(e?.message || e).slice(0, 500);
  if (/does not support SSL/i.test(msg)) {
    return {
      error: "Postgres connection error: the server does not support TLS.",
      details: "VerifyRuns connects with TLS unless the connection string says sslmode=disable. Add sslmode=disable to connect unencrypted — the password and every row then travel in cleartext, so only do this over a network you trust.",
    };
  }
  if (tls && (/terminated unexpectedly/i.test(msg) || /^internal error/i.test(msg))) {
    return {
      error: "Postgres connection error: TLS handshake failed.",
      details: `The server accepted TLS but the handshake did not complete (${msg}). On the hosted build (Cloudflare Workers) the server certificate must be publicly trusted; Supabase, and providers like RDS and Cloud SQL, sign with private CAs that the platform will not accept. Options: a publicly trusted certificate on the database, sslmode=disable to connect unencrypted (cleartext), or self-host VerifyRuns next to the database.`,
    };
  }
  if (/terminated unexpectedly/i.test(msg) || /^internal error/i.test(msg) || /cannot connect to the specified address/i.test(msg)) {
    return { error: "Postgres connection error: the database refused or dropped the connection.", details: `${msg}. Check the host, port and firewall; on the hosted build the database must be reachable from the public internet.` };
  }
  if (e?.code === "TIMEOUT") return { error: `Postgres connection error: ${msg}.`, details: "Check the host, port and firewall; on the hosted build the database must be reachable from the public internet." };
  return { error: `Postgres connection error: ${e?.code || e?.name || "Error"}.`, details: msg };
}
