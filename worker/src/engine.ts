/** The verdict engine — deterministic code, no model. Ported 1:1 from backend/server.py. */
import { sha256Hex } from "./crypto";
import { Expectations } from "./validate";

export const NEWEST_WINDOW = 5;

export interface Fingerprint {
  record_count: number;
  sample_size: number;
  fields: string[];
  newest_record: Record<string, unknown> | null;
  newest_window: Record<string, unknown>[];
  newest_defined: boolean;
  null_pct: Record<string, number>;
  /** Set when the connector knows the count is wrong: capped at a page ceiling or estimated after a
   *  COUNT timeout. Either flag makes a configured growth assertion incomplete. */
  count_capped?: boolean;
  count_estimated?: boolean;
  read_succeeded?: boolean;
  source_key?: string;
  count_baseline?: CountBaseline | null;
}

export interface CountBaseline {
  record_count: number;
  count_capped?: boolean;
  count_estimated?: boolean;
}

export interface FetchMeta {
  total: number;
  capped: boolean;
  count_estimated: boolean;
  newest_defined?: boolean;
}

export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/** `records` arrive newest-first from the connector; `total` is the true count when known. */
export function fingerprint(records: Record<string, unknown>[], total?: number, newestDefined = true): Fingerprint {
  const count = records.length;
  const fieldSet = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) fieldSet.add(k);
  const fields = [...fieldSet].sort();
  const null_pct: Record<string, number> = {};
  if (count > 0) {
    for (const f of fields) {
      const empties = records.filter((r) => isEmpty(r[f])).length;
      null_pct[f] = Math.round((empties / count) * 1000) / 10;
    }
  }
  return {
    record_count: total ?? count,
    sample_size: count,
    fields,
    newest_record: records[0] ?? null,
    newest_window: records.slice(0, NEWEST_WINDOW),
    newest_defined: !!newestDefined,
    null_pct,
  };
}

export function humanJoin(items: string[]): string {
  const xs = items.filter(Boolean);
  if (!xs.length) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

export type Verdict = "PASS" | "FAIL";

export function computeVerdict(fp: Fingerprint, prevPasses: { fingerprint: any }[], expectations: Partial<Expectations>, claimedNew: number | null = null, countBaseline: CountBaseline | null = prevPasses.at(-1)?.fingerprint ?? null): [Verdict, string] {
  const reasons: string[] = [];
  const incomplete: string[] = [];
  const minNew = Number(expectations.min_new_records ?? 1) || 0;
  const mode = expectations.growth_mode || "growth";
  const required = (expectations.required_fields || []).map((f) => f.trim()).filter(Boolean);
  const nonEmpty = (expectations.non_empty_fields || []).map((f) => f.trim()).filter(Boolean);

  const prevLast = countBaseline;
  const delta = prevLast ? fp.record_count - prevLast.record_count : 0;

  // A count the connector knows is wrong (capped page ceiling, timed-out COUNT) on either side of
  // the comparison cannot substantiate a growth assertion. Field rules still run.
  const anyCapped = !!(fp.count_capped || prevLast?.count_capped);
  const countExact = !anyCapped && !fp.count_estimated && !prevLast?.count_estimated;
  const needsCount = mode === "steady" || mode === "claimed" || claimedNew !== null || minNew > 0;
  if (needsCount && !countExact) incomplete.push(`Record-count checks could not be evaluated: the count is ${anyCapped ? "capped" : "estimated"}. Use a complete, countable destination.`);
  else if (needsCount && !prevLast) incomplete.push(`Baseline recorded at ${fp.record_count} records. Growth has not been verified yet; send the next run after the workflow writes to the destination.`);

  if (mode === "claimed" && claimedNew === null && prevLast) {
    // About the body, not the count: enforced even when the count is inexact.
    reasons.push('your workflow sent no record count (this Check expects {"wrote": N} in the webhook body)');
  } else if (needsCount && countExact && prevLast) {
    if (mode === "steady") {
      if (prevLast && delta !== 0) reasons.push(`the destination changed by ${delta > 0 ? "+" : ""}${delta} records (expected no change)`);
    } else if (claimedNew !== null) {
      if (prevLast && delta < claimedNew) reasons.push(`your workflow said it wrote ${claimedNew} records; the destination gained ${delta}`);
    } else if (prevLast && delta < minNew) {
      reasons.push(`the destination gained ${delta} records (expected at least ${minNew})`);
    }
  }

  const missingRequired = required.filter((f) => !fp.fields.includes(f));
  for (const f of missingRequired) reasons.push(`the field \`${f}\` is missing`);

  if (prevPasses.length) {
    let always = new Set<string>(prevPasses[0].fingerprint.fields || []);
    for (const p of prevPasses.slice(1)) always = new Set([...always].filter((f) => (p.fingerprint.fields || []).includes(f)));
    for (const f of always) {
      if (!fp.fields.includes(f) && !missingRequired.includes(f)) reasons.push(`the field \`${f}\` disappeared — it was present in the last ${prevPasses.length} good runs`);
    }
  }

  const notes: string[] = [];
  if (!needsCount) notes.push("No record-growth requirement was configured.");
  if (!needsCount && !countExact) notes.push("The record count is approximate; only configured field checks were evaluated.");
  const newest = fp.newest_record || {};
  const window = fp.newest_window?.length ? fp.newest_window : fp.newest_record ? [fp.newest_record] : [];
  if (nonEmpty.length && fp.newest_defined === false) {
    incomplete.push("Newest-record checks could not be evaluated: the newest sample is unavailable. Use a complete result; for Postgres, add ORDER BY <timestamp column> DESC.");
  } else if (nonEmpty.length && !window.length) {
    reasons.push("there are no records to inspect for the configured non-empty fields");
  } else if (window.length) {
    for (const f of nonEmpty) {
      if (!fp.fields.includes(f)) {
        if (!missingRequired.includes(f)) reasons.push(`the field \`${f}\` is missing (configured as non-empty)`);
        continue;
      }
      if (!isEmpty((newest as any)[f])) continue;
      const empties = window.filter((r) => isEmpty((r || {})[f])).length;
      if (window.length === 1) reasons.push(`the field \`${f}\` is empty in the newest record`);
      else if (empties * 2 > window.length) reasons.push(`the field \`${f}\` is empty in ${empties} of the ${window.length} newest records`);
    }
  }

  const suffix = [...incomplete, ...notes].length ? " " + [...incomplete, ...notes].join(" ") : "";
  if (reasons.length) return ["FAIL", `Run reported success, but ${humanJoin(reasons)}.${suffix}`];
  if (incomplete.length) return ["FAIL", `Verification incomplete.${suffix}`];
  if (!needsCount) return ["PASS", `Destination read successfully. Configured checks passed.${suffix}`];
  if (mode === "steady") return ["PASS", `Destination unchanged at ${fp.record_count} records since the previous observation. Configured checks passed.`];
  if (claimedNew !== null) return ["PASS", `Destination gained ${delta} record(s) since the previous observation; your workflow reported at least ${claimedNew}. Configured checks passed.`];
  return ["PASS", `Destination gained ${delta} record(s) since the previous observation. Configured checks passed.`];
}

// `count` was dropped as a claim alias (2026-08-31): forwarded node payloads carry it accidentally,
// and a passthrough {"count": 0} must never read as "my workflow wrote nothing".
const CLAIM_KEYS = ["wrote", "expected_new"];

export function parseClaimed(body: unknown): [number | null, string | null] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [null, null];
  const b = body as Record<string, unknown>;
  for (const key of CLAIM_KEYS) {
    if (key in b) {
      const v = b[key];
      let n: number | null = null;
      if (typeof v === "number" && Number.isInteger(v)) n = v;
      else if (typeof v === "string" && /^-?\d+$/.test(v.trim())) n = Number(v.trim());
      else return [null, `webhook body ignored: \`${key}\` is not an integer`];
      if (!Number.isSafeInteger(n)) return [null, `webhook body ignored: \`${key}\` is not a safe integer`];
      if (n < 0) return [null, `webhook body ignored: \`${key}\` is negative`];
      return [n, null];
    }
  }
  if ("count" in b) return [null, "webhook body key `count` is no longer read; send `wrote`"];
  return [null, null];
}

export interface Reported {
  failed: boolean;
  error: string | null;
}

/** `{"failed": true, "error": "…"}` in the webhook body: the workflow itself says it failed.
 *  Only a boolean `true` counts — forwarded payloads (job rows, payment objects) carry all sorts of
 *  status-like keys, and a string "true" is noted on the run rather than read, like a bad `wrote`. */
export function parseReported(body: unknown): [Reported, string | null] {
  const none: Reported = { failed: false, error: null };
  if (!body || typeof body !== "object" || Array.isArray(body)) return [none, null];
  const b = body as Record<string, unknown>;
  if (!("failed" in b)) return [none, null];
  if (typeof b.failed !== "boolean") return [none, "webhook body ignored: `failed` is not a boolean"];
  if (!b.failed) return [none, null];
  const error = typeof b.error === "string" ? b.error.replace(/[\r\n]+/g, " ").trim().slice(0, 500).replace(/\.+$/, "").trim() : "";
  return [{ failed: true, error: error || null }, null];
}

export function reportedFailureMessage(error: string | null): string {
  return error ? `Your workflow reported failure: ${error.replace(/\.+$/, "")}.` : "Your workflow reported failure (no reason given).";
}

/** Conservative top-level SQL tokens. Literal/comment contents and nested clauses
 * cannot establish ordering. Unsupported or unclosed syntax fails closed. */
function outerSqlTokens(query: string): { text: string; identifier: boolean }[] | null {
  const tokens: { text: string; identifier: boolean }[] = [];
  let depth = 0;
  for (let i = 0; i < query.length;) {
    const tail = query.slice(i);
    if (/^\s/.test(tail)) { i++; continue; }
    if (tail.startsWith("--")) { const end = query.indexOf("\n", i); i = end < 0 ? query.length : end; continue; }
    if (tail.startsWith("/*")) {
      let comments = 1; i += 2;
      while (i < query.length && comments) {
        if (query.startsWith("/*", i)) { comments++; i += 2; }
        else if (query.startsWith("*/", i)) { comments--; i += 2; }
        else i++;
      }
      if (comments) return null;
      continue;
    }
    const dollar = tail.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (dollar) {
      const end = query.indexOf(dollar, i + dollar.length);
      if (end < 0) return null;
      if (!depth) tokens.push({ text: "<literal>", identifier: false });
      i = end + dollar.length; continue;
    }
    if (query[i] === "'" || query[i] === '"') {
      const quote = query[i++]; let value = ""; let closed = false;
      while (i < query.length) {
        const ch = query[i++];
        // Reject backslash-escaped strings rather than guessing standard_conforming_strings.
        if (quote === "'" && ch === "\\") return null;
        if (ch === quote) {
          if (query[i] === quote) { value += quote; i++; }
          else { closed = true; break; }
        } else value += ch;
      }
      if (!closed) return null;
      if (!depth) tokens.push({ text: quote === '"' ? value : "<literal>", identifier: quote === '"' });
      continue;
    }
    if (query[i] === "(") { if (!depth) tokens.push({ text: "<expression>", identifier: false }); depth++; i++; continue; }
    if (query[i] === ")") { if (--depth < 0) return null; i++; continue; }
    const word = tail.match(/^[A-Za-z_][A-Za-z_0-9$]*/)?.[0];
    if (word) { if (!depth) tokens.push({ text: word.toLowerCase(), identifier: false }); i += word.length; continue; }
    if (!depth) tokens.push({ text: query[i], identifier: false });
    i++;
  }
  return depth ? null : tokens;
}

/** Safe ORDER BY for the OUTER sample, using only quoted output-column names.
 * The first column must explicitly descend; remaining columns are tie-breakers.
 * The operator is responsible for choosing a column that actually grows with time. */
export function postgresSampleOrder(query: string): string | null {
  const tokens = outerSqlTokens(query || "");
  if (!tokens) return null;
  const keyword = (i: number, word: string) => tokens[i]?.text === word && !tokens[i]?.identifier;
  const starts = tokens.map((_, i) => keyword(i, "order") && keyword(i + 1, "by") ? i : -1).filter(i => i >= 0);
  if (starts.length !== 1) return null;
  let i = starts[0] + 2;
  const parts: string[] = [];
  const column = () => {
    const t = tokens[i];
    if (!t || (!t.identifier && !/^[a-z_][a-z_0-9$]*$/.test(t.text))) return null;
    i++; return t.text;
  };
  while (i < tokens.length) {
    let name = column();
    if (name === null) return null;
    while (keyword(i, ".")) { i++; name = column(); if (name === null) return null; }
    const direction = keyword(i, "desc") ? "DESC" : keyword(i, "asc") ? "ASC" : null;
    if (!direction || (!parts.length && direction !== "DESC")) return null;
    i++;
    let nulls = "";
    if (keyword(i, "nulls")) {
      i++;
      if (!keyword(i, "first") && !keyword(i, "last")) return null;
      nulls = ` NULLS ${tokens[i++].text.toUpperCase()}`;
    }
    parts.push(`"${name.replace(/"/g, '""')}" ${direction}${nulls}`);
    if (i === tokens.length) break;
    if (keyword(i, "limit") || keyword(i, "offset") || keyword(i, "fetch") || keyword(i, "for")) break;
    if (!keyword(i, ",")) return null;
    i++;
    if (i === tokens.length) return null;
  }
  return parts.length ? parts.join(", ") : null;
}

export function hasOrderBy(query: string): boolean {
  return postgresSampleOrder(query) !== null;
}

/** Newest-first by `key`; records without the key go last, original order kept among ties. */
export function sortDesc<T extends Record<string, any>>(records: T[], key: string): T[] {
  const withKey = records.filter((r) => r[key] !== null && r[key] !== undefined);
  const without = records.filter((r) => r[key] === null || r[key] === undefined);
  const cmp = (a: T, b: T) => {
    const x = a[key], y = b[key];
    if (typeof x === "number" && typeof y === "number") return y - x;
    const sx = String(x), sy = String(y);
    return sx < sy ? 1 : sx > sy ? -1 : 0;
  };
  return [...withKey].sort(cmp).concat(without);
}

function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return JSON.stringify(v);
  return JSON.stringify(String(v));
}

export async function canonicalHash(obj: unknown): Promise<string | null> {
  if (obj === null || obj === undefined) return null;
  return sha256Hex(canonical(obj));
}

export interface SampleDoc {
  newest_record: Record<string, unknown> | null;
  newest_window: Record<string, unknown>[];
  error_details: string | null;
  expires_at: string;
}

export async function splitSample(fp: Fingerprint, errorDetails: string | null, storeSamples: boolean, ttlDays: number): Promise<[Record<string, unknown>, SampleDoc | null]> {
  const { newest_record, newest_window, ...rest } = fp;
  const stored: Record<string, unknown> = { ...rest, newest_hash: await canonicalHash(newest_record), sample_stored: !!storeSamples };
  if (!storeSamples) return [stored, null];
  return [stored, { newest_record, newest_window: newest_window || [], error_details: errorDetails, expires_at: new Date(Date.now() + ttlDays * 86400_000).toISOString() }];
}

export function annotateCount(message: string, meta: FetchMeta, ceiling: number): string {
  if (meta.capped) message += ` Count capped at ${ceiling.toLocaleString("en-US")} records.`;
  if (meta.count_estimated) message += " Count estimated from the sample (the full count timed out).";
  return message;
}
