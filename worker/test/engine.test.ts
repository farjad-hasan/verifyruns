import { describe, expect, it } from "vitest";
import { annotateCount, canonicalHash, computeVerdict, fingerprint, hasOrderBy, parseClaimed, splitSample } from "../src/engine";

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

describe("verdict: growth", () => {
  it("first run", () => {
    const [v, m] = computeVerdict(fingerprint(records(40)), [], DEFAULTS);
    expect(v).toBe("PASS");
    expect(m).toBe("First successful check. Destination has 40 records across 2 fields.");
  });
  it("no-op run FAILs", () => {
    const [v, m] = computeVerdict(fingerprint(records(40)), [passRun(40)], DEFAULTS);
    expect(v).toBe("FAIL");
    expect(m).toBe("Run reported success, but the destination gained 0 records (expected at least 1).");
  });
  it("growth PASSes, also with a large true count over a 100 sample", () => {
    expect(computeVerdict(fingerprint(records(43)), [passRun(40)], DEFAULTS)).toEqual(["PASS", "Destination gained 3 record(s). All expectations met."]);
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
    expect(computeVerdict(fingerprint(records(43)), [passRun(40)], DEFAULTS, 3)).toEqual(["PASS", "Destination gained 3 record(s), matching what your workflow reported."]);
    expect(computeVerdict(fingerprint(records(42)), [passRun(40)], { ...DEFAULTS, min_new_records: 5 }, 2)[0]).toBe("PASS");
  });
  it("growth optional at 0", () => {
    expect(computeVerdict(fingerprint(records(40)), [passRun(40)], { ...DEFAULTS, min_new_records: 0 })).toEqual(["PASS", "Destination gained 0 record(s). All expectations met."]);
  });
  it("steady", () => {
    const STEADY = { ...DEFAULTS, growth_mode: "steady" as const };
    expect(computeVerdict(fingerprint(records(11)), [passRun(12)], STEADY)).toEqual(["FAIL", "Run reported success, but the destination changed by -1 records (expected no change)."]);
    expect(computeVerdict(fingerprint(records(12)), [passRun(12)], STEADY)).toEqual(["PASS", "Destination unchanged at 12 records. All expectations met."]);
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
  it("undefined newest skips with a note", () => {
    const prev = [passRun(3, ["email", "id"])];
    const [v, m] = computeVerdict(fingerprint(rows(["", "", ""]), undefined, false), prev, NE);
    expect(v).toBe("PASS");
    expect(m.endsWith("Newest-record checks were skipped: add ORDER BY <timestamp column> DESC to the query to enable them.")).toBe(true);
    expect(computeVerdict(fingerprint(rows(["", "", ""]), undefined, false), prev, { ...NE, non_empty_fields: [] })[1]).not.toContain("skipped");
  });
});

describe("helpers", () => {
  it("parseClaimed", () => {
    expect(parseClaimed({ wrote: 3 })).toEqual([3, null]);
    expect(parseClaimed({ expected_new: 2 })).toEqual([2, null]);
    expect(parseClaimed({ count: "5" })).toEqual([5, null]);
    expect(parseClaimed({ wrote: "three" })).toEqual([null, "webhook body ignored: `wrote` is not an integer"]);
    expect(parseClaimed(null)).toEqual([null, null]);
    expect(parseClaimed([1])).toEqual([null, null]);
    expect(parseClaimed({ wrote: true })).toEqual([null, "webhook body ignored: `wrote` is not an integer"]);
  });
  it("hasOrderBy", () => {
    expect(hasOrderBy("SELECT * FROM orders ORDER BY created_at DESC")).toBe(true);
    expect(hasOrderBy("select id from t order\n by ts")).toBe(true);
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
