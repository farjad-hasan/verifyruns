import { describe, expect, it } from "vitest";
import { annotateCount, canonicalHash, computeVerdict, fingerprint, hasOrderBy, postgresSampleOrder, parseClaimed, parseReported, reportedFailureMessage, splitSample } from "../src/engine";

const records = (n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({ id: i, name: `row ${i}`, ...extra }));
const passRun = (record_count: number, fields: string[] = ["id", "name"], sample_size?: number) => ({
  verdict: "PASS",
  fingerprint: { record_count, sample_size: sample_size ?? record_count, fields: [...fields].sort(), newest_record: Object.fromEntries(fields.map((f) => [f, "x"])), null_pct: {} },
});
const DEFAULTS = { min_new_records: 1, required_fields: [], non_empty_fields: [], growth_mode: "growth" as const };

describe("fingerprint", () => {
  it("defaults total to sample length, records sample_size", () => {
    const fp = fingerprint(records(3));
    expect(fp.record_count).toBe(3);
    expect(fp.sample_size).toBe(3);
  });
  it("record_count is the total, not the sample", () => {
    const fp = fingerprint(records(100), 2403);
    expect(fp.record_count).toBe(2403);
    expect(fp.sample_size).toBe(100);
  });
  it("fields, null_pct, newest = first (connectors hand records over newest-first), window of 5", () => {
    const fp = fingerprint([{ a: 1, b: "" }, { a: 2 }]);
    expect(fp.fields).toEqual(["a", "b"]);
    expect(fp.null_pct).toEqual({ a: 0.0, b: 100.0 });
    expect(fp.newest_record).toEqual({ a: 1, b: "" });
    const w = fingerprint(records(7));
    expect(w.newest_window.map((r: any) => r.id)).toEqual([0, 1, 2, 3, 4]);
    expect(w.newest_defined).toBe(true);
    expect(fingerprint(records(1), undefined, false).newest_defined).toBe(false);
  });
});

describe("claims: keys and clamps", () => {
  const COUNT_NOTE = "webhook body key `count` is no longer read; send `wrote`";
  it("reads wrote and expected_new; a bare count key is ignored with a migration note", () => {
    expect(parseClaimed({ wrote: 3 })).toEqual([3, null]);
    expect(parseClaimed({ expected_new: "4" })).toEqual([4, null]);
    expect(parseClaimed({ count: 0 })).toEqual([null, COUNT_NOTE]);
    expect(parseClaimed({ count: 7 })).toEqual([null, COUNT_NOTE]);
    expect(parseClaimed({ wrote: 2, count: 9 })).toEqual([2, null]);
  });
  it("wrote: 0 is a first-class claim", () => {
    expect(parseClaimed({ wrote: 0 })).toEqual([0, null]);
  });
  it("negative claims are treated as absent with a note", () => {
    expect(parseClaimed({ wrote: -2 })).toEqual([null, "webhook body ignored: `wrote` is negative"]);
    expect(parseClaimed({ expected_new: "-3" })).toEqual([null, "webhook body ignored: `expected_new` is negative"]);
  });
  it("a passthrough {count: 0} does not claim: the growth rule still applies", () => {
    const [claimed] = parseClaimed({ count: 0 });
    const [v, m] = computeVerdict(fingerprint(records(40)), [passRun(40)], DEFAULTS, claimed);
    expect(v).toBe("FAIL");
    expect(m).toContain("the destination gained 0 records (expected at least 1)");
  });
  it("a deliberate {wrote: 0} PASSes on an unchanged destination", () => {
    const [claimed] = parseClaimed({ wrote: 0 });
    const [v, m] = computeVerdict(fingerprint(records(40)), [passRun(40)], DEFAULTS, claimed);
    expect(v).toBe("PASS");
    expect(m).toBe("Destination gained 0 record(s) since the previous observation; your workflow reported at least 0. Configured checks passed.");
  });
  it("claimed mode with a negative body FAILs with the teaching message", () => {
    const [claimed] = parseClaimed({ wrote: -1 });
    const [v, m] = computeVerdict(fingerprint(records(40)), [passRun(40)], { ...DEFAULTS, growth_mode: "claimed" }, claimed);
    expect(v).toBe("FAIL");
    expect(m).toContain('your workflow sent no record count (this Check expects {"wrote": N} in the webhook body)');
  });
});

describe("verdict: inexact counts", () => {
  const SKIP_CAP = "Record-count checks could not be evaluated: the count is capped. Use a complete, countable destination.";
  const SKIP_EST = "Record-count checks could not be evaluated: the count is estimated. Use a complete, countable destination.";
  const capped = (fp: any) => ({ ...fp, count_capped: true });
  const cappedPass = (n: number, fields?: string[]) => ({ ...passRun(n, fields), fingerprint: { ...passRun(n, fields).fingerprint, count_capped: true } });

  it("a capped run cannot substantiate growth with a note instead of failing on a saturated delta", () => {
    const [v, m] = computeVerdict(capped(fingerprint(records(100), 4000)), [passRun(4000)], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe(`Verification incomplete. ${SKIP_CAP}`);
  });
  it("a capped baseline also cannot substantiate growth", () => {
    const [v, m] = computeVerdict(fingerprint(records(100), 100), [cappedPass(4000)], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe(`Verification incomplete. ${SKIP_CAP}`);
  });
  it("an estimated baseline against a sample-collapsed count is incomplete", () => {
    const est = { ...passRun(5_000_000), fingerprint: { ...passRun(5_000_000).fingerprint, count_estimated: true } };
    const [v, m] = computeVerdict(fingerprint(records(100), 100), [est], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe(`Verification incomplete. ${SKIP_EST}`);
  });
  it("this run's COUNT timing out (count_estimated on the run itself) cannot verify growth", () => {
    const fp = { ...fingerprint(records(100), 100), count_estimated: true };
    const [v, m] = computeVerdict(fp, [passRun(5_000_000)], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe(`Verification incomplete. ${SKIP_EST}`);
  });
  it("field rules still fire on a capped run", () => {
    const prev = [0, 1, 2].map(() => cappedPass(4000, ["id", "name", "sku"]));
    const [v, m] = computeVerdict(capped(fingerprint(records(100), 4000)), prev, DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toContain("the field `sku` disappeared — it was present in the last 3 good runs");
    expect(m).toContain(SKIP_CAP);
  });
  it("steady mode with an inexact count is incomplete on change", () => {
    const [v, m] = computeVerdict(capped(fingerprint(records(11), 11)), [passRun(12)], { ...DEFAULTS, growth_mode: "steady" });
    expect(v).toBe("FAIL");
    expect(m).toBe(`Verification incomplete. ${SKIP_CAP}`);
  });
  it("claimed mode still requires the claim even when the count is inexact", () => {
    const [v, m] = computeVerdict(capped(fingerprint(records(100), 4000)), [passRun(4000)], { ...DEFAULTS, growth_mode: "claimed" }, null);
    expect(v).toBe("FAIL");
    expect(m).toContain("your workflow sent no record count");
  });
});

describe("verdict: growth", () => {
  it("first run", () => {
    const [v, m] = computeVerdict(fingerprint(records(40)), [], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe("Verification incomplete. Baseline recorded at 40 records. Growth has not been verified yet; send the next run after the workflow writes to the destination.");
  });
  it("no-op run FAILs", () => {
    const [v, m] = computeVerdict(fingerprint(records(40)), [passRun(40)], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe("Run reported success, but the destination gained 0 records (expected at least 1).");
  });
  it("growth PASSes, also with a large true count over a 100 sample", () => {
    expect(computeVerdict(fingerprint(records(43)), [passRun(40)], DEFAULTS)).toEqual(["PASS", "Destination gained 3 record(s) since the previous observation. Configured checks passed."]);
    expect(computeVerdict(fingerprint(records(100), 2403), [passRun(2400, ["id", "name"], 100)], DEFAULTS)[0]).toBe("PASS");
  });
  it("two reasons joined with 'and'", () => {
    const [v, m] = computeVerdict(fingerprint(records(40)), [passRun(40)], { ...DEFAULTS, required_fields: ["price"] });
    expect(v).toBe("FAIL");
    expect(m).toBe("Run reported success, but the destination gained 0 records (expected at least 1) and the field `price` is missing.");
  });
  it("disappeared field names the window", () => {
    const prev = [0, 1, 2].map((i) => passRun(40 + i, ["id", "name", "sku"]));
    const [, m] = computeVerdict(fingerprint(records(50)), prev, DEFAULTS);
    expect(m).toContain("the field `sku` disappeared — it was present in the last 3 good runs");
  });
});

describe("verdict: claimed / steady", () => {
  it("claimed mismatch and match", () => {
    expect(computeVerdict(fingerprint(records(40)), [passRun(40)], DEFAULTS, 3)).toEqual(["FAIL", "Run reported success, but your workflow said it wrote 3 records; the destination gained 0."]);
    expect(computeVerdict(fingerprint(records(43)), [passRun(40)], DEFAULTS, 3)).toEqual(["PASS", "Destination gained 3 record(s) since the previous observation; your workflow reported at least 3. Configured checks passed."]);
    expect(computeVerdict(fingerprint(records(42)), [passRun(40)], { ...DEFAULTS, min_new_records: 5 }, 2)[0]).toBe("PASS");
  });
  it("growth optional at 0", () => {
    expect(computeVerdict(fingerprint(records(40)), [passRun(40)], { ...DEFAULTS, min_new_records: 0 })).toEqual(["PASS", "Destination read successfully. Configured checks passed. No record-growth requirement was configured."]);
  });
  it("steady", () => {
    const STEADY = { ...DEFAULTS, growth_mode: "steady" as const };
    expect(computeVerdict(fingerprint(records(11)), [passRun(12)], STEADY)).toEqual(["FAIL", "Run reported success, but the destination changed by -1 records (expected no change)."]);
    expect(computeVerdict(fingerprint(records(12)), [passRun(12)], STEADY)).toEqual(["PASS", "Destination unchanged at 12 records since the previous observation. Configured checks passed."]);
  });
  it("claimed mode without a count", () => {
    const CLAIMED = { ...DEFAULTS, growth_mode: "claimed" as const };
    expect(computeVerdict(fingerprint(records(41)), [passRun(40)], CLAIMED, null)).toEqual(["FAIL", 'Run reported success, but your workflow sent no record count (this Check expects {"wrote": N} in the webhook body).']);
    expect(computeVerdict(fingerprint(records(41)), [passRun(40)], CLAIMED, 1)[0]).toBe("PASS");
  });
});

describe("verdict: non-empty window", () => {
  const rows = (emails: string[]) => emails.map((e, i) => ({ id: i, email: e }));
  const NE = { min_new_records: 0, required_fields: [], non_empty_fields: ["email"], growth_mode: "growth" as const };
  it("one outlier passes; majority fails; single-record window fails; present newest passes", () => {
    const prev = (n: number) => [passRun(n, ["email", "id"])];
    expect(computeVerdict(fingerprint(rows(["", "a", "b", "c", "d", "e"])), prev(6), NE)[0]).toBe("PASS");
    const [v, m] = computeVerdict(fingerprint(rows(["", "", "", "a", "b", "c"])), prev(6), NE);
    expect(v).toBe("FAIL");
    expect(m).toContain("the field `email` is empty in 3 of the 5 newest records");
    expect(computeVerdict(fingerprint(rows([""])), prev(1), NE)[1]).toContain("the field `email` is empty in the newest record");
    expect(computeVerdict(fingerprint(rows(["a", "", "", "", "b"])), prev(5), NE)[0]).toBe("PASS");
  });
  it("undefined newest fails a configured newest-record assertion", () => {
    const prev = [passRun(3, ["email", "id"])];
    const [v, m] = computeVerdict(fingerprint(rows(["", "", ""]), undefined, false), prev, NE);
    expect(v).toBe("FAIL");
    expect(m).toContain("Newest-record checks could not be evaluated:");
    expect(m).toContain("ORDER BY");
    expect(computeVerdict(fingerprint(rows(["", "", ""]), undefined, false), prev, { ...NE, non_empty_fields: [] })[1]).not.toContain("skipped");
  });
});

describe("helpers", () => {
  it("parseClaimed", () => {
    expect(parseClaimed({ wrote: 3 })).toEqual([3, null]);
    expect(parseClaimed({ expected_new: 2 })).toEqual([2, null]);
    expect(parseClaimed({ count: "5" })).toEqual([null, "webhook body key `count` is no longer read; send `wrote`"]);
    expect(parseClaimed({ wrote: "three" })).toEqual([null, "webhook body ignored: `wrote` is not an integer"]);
    expect(parseClaimed(null)).toEqual([null, null]);
    expect(parseClaimed([1])).toEqual([null, null]);
    expect(parseClaimed({ wrote: true })).toEqual([null, "webhook body ignored: `wrote` is not an integer"]);
  });
  it("hasOrderBy", () => {
    expect(hasOrderBy("SELECT * FROM orders ORDER BY created_at DESC")).toBe(true);
    expect(hasOrderBy("select id from t order\n by ts")).toBe(false);
    expect(hasOrderBy("SELECT * FROM orders")).toBe(false);
    expect(hasOrderBy("SELECT border_by FROM t")).toBe(false);
  });
  it("canonicalHash is key-order independent; splitSample strips rows by default", async () => {
    expect(await canonicalHash({ a: 1, b: [1, 2] })).toBe(await canonicalHash({ b: [1, 2], a: 1 }));
    expect(await canonicalHash(null)).toBeNull();
    const fp = fingerprint([{ id: 1, email: "a@b.c" }, { id: 2, email: "" }]);
    const [stored, sample] = await splitSample(fp, "body", false, 30);
    expect(stored.newest_record).toBeUndefined();
    expect(stored.newest_window).toBeUndefined();
    expect(stored.newest_hash).toBe(await canonicalHash({ id: 1, email: "a@b.c" }));
    expect(stored.sample_stored).toBe(false);
    expect(sample).toBeNull();
    const [s2, smp] = await splitSample(fingerprint([{ id: 1 }]), "body", true, 30);
    expect(s2.sample_stored).toBe(true);
    expect(smp!.newest_record).toEqual({ id: 1 });
    expect(smp!.error_details).toBe("body");
    expect(new Date(smp!.expires_at).getTime() - Date.now()).toBeGreaterThan(29 * 86400_000);
  });
  it("annotateCount", () => {
    expect(annotateCount("m.", { total: 1, capped: true, count_estimated: false }, 4000)).toBe("m. Count capped at 4,000 records.");
    expect(annotateCount("m.", { total: 1, capped: false, count_estimated: true }, 4000)).toBe("m. Count estimated from the sample (the full count timed out).");
  });
});

describe("parseReported", () => {
  const none = { failed: false, error: null };
  it("reads a boolean failed: true with an optional error, trimmed to 500, newlines collapsed", () => {
    expect(parseReported({ failed: true })).toEqual([{ failed: true, error: null }, null]);
    expect(parseReported({ failed: true, error: "  exit 1 " })).toEqual([{ failed: true, error: "exit 1" }, null]);
    expect(parseReported({ failed: true, error: "x".repeat(900) })).toEqual([{ failed: true, error: "x".repeat(500) }, null]);
    expect(parseReported({ failed: true, error: "line one\nline two\r\n@everyone" })).toEqual([{ failed: true, error: "line one line two @everyone" }, null]);
    expect(parseReported({ failed: true, error: 42 })).toEqual([{ failed: true, error: null }, null]);
    expect(parseReported({ failed: true, error: "   " })).toEqual([{ failed: true, error: null }, null]);
    expect(parseReported({ failed: true, error: "..." })).toEqual([{ failed: true, error: null }, null]);
    expect(parseReported({ failed: true, error: "timed out. " })).toEqual([{ failed: true, error: "timed out" }, null]);
  });
  it("only a boolean counts: strings and numbers are noted, not read; false, absent, non-object bodies and error alone are ignored", () => {
    expect(parseReported({ failed: "true" })).toEqual([none, "webhook body ignored: `failed` is not a boolean"]);
    expect(parseReported({ failed: 1 })).toEqual([none, "webhook body ignored: `failed` is not a boolean"]);
    expect(parseReported({ failed: false, error: "ignored" })).toEqual([none, null]);
    expect(parseReported({ status: "failed" })).toEqual([none, null]);
    expect(parseReported({ wrote: 2 })).toEqual([none, null]);
    expect(parseReported({ error: "boom" })).toEqual([none, null]);
    expect(parseReported(null)).toEqual([none, null]);
    expect(parseReported("failed")).toEqual([none, null]);
    expect(parseReported([{ failed: true }])).toEqual([none, null]);
  });
  it("message never doubles the full stop", () => {
    expect(reportedFailureMessage("timed out.")).toBe("Your workflow reported failure: timed out.");
    expect(reportedFailureMessage("timed out")).toBe("Your workflow reported failure: timed out.");
    expect(reportedFailureMessage(null)).toBe("Your workflow reported failure (no reason given).");
  });
});



describe("Postgres newest ordering evidence", () => {
  it.each([
    "SELECT * FROM t ORDER BY created_at ASC",
    "SELECT * FROM t ORDER BY created_at",
    "SELECT * FROM t /* ORDER BY created_at DESC */",
    "SELECT 'ORDER BY created_at DESC' FROM t",
    'SELECT "ORDER BY created_at DESC" FROM t',
    "SELECT $$ ORDER BY created_at DESC $$ FROM t",
    "SELECT $tag$ ORDER BY created_at DESC $tag$ FROM t",
    "SELECT row_number() OVER (ORDER BY created_at DESC) FROM t",
    "SELECT * FROM (SELECT * FROM t ORDER BY created_at DESC) nested",
    "SELECT * FROM t ORDER BY coalesce(created_at, now()) DESC",
    "SELECT * FROM t ORDER BY 1 DESC",
    "SELECT * FROM t ORDER BY created_at DESC,",
    "SELECT * FROM t /* nested /* ORDER BY created_at DESC */ comment */",
  ])("fails closed for %s", query => {
    expect(postgresSampleOrder(query)).toBeNull();
    expect(computeVerdict(fingerprint([{email:"ok"}],1,hasOrderBy(query)), [], {min_new_records:0,non_empty_fields:["email"]})[0]).toBe("FAIL");
  });
  it("preserves qualified, quoted descending columns and explicit tie breakers outside the subquery", () => {
    expect(postgresSampleOrder('SELECT * FROM t ORDER BY t.created_at DESC NULLS LAST, t.id ASC')).toBe('"created_at" DESC NULLS LAST, "id" ASC');
    expect(postgresSampleOrder('WITH q AS (SELECT * FROM t ORDER BY id ASC) SELECT * FROM q ORDER BY "Created At" DESC')).toBe('"Created At" DESC');
    expect(postgresSampleOrder('SELECT * FROM t ORDER BY created_at /* nested /* comment */ end */ DESC')).toBe('"created_at" DESC');
  });
});
