// The expectation and heartbeat fields, rendered by both New Check and the Expectations editor
// on Check detail so their labels, hints and option text cannot diverge (design-system spec,
// "Every form control has a visible, associated label"). `idPrefix` keys the label/input pairs;
// `testidPrefix` keeps the existing `check-*` and `edit-*` test ids.

export const MODE_HINT = {
  growth: "The destination must gain at least the minimum below, or at least what the workflow claimed with {\"wrote\": N}.",
  steady: "The count must not change between runs — for lookup tables and config rows.",
  claimed: "Every run must send {\"wrote\": N} and the destination must gain exactly that many.",
};

const LABEL = "text-[11px] uppercase tracking-wider text-quiet block mb-2";

export function ExpectationsFields({
  idPrefix = "check",
  testidPrefix = "check",
  mode,
  setMode,
  minNew,
  setMinNew,
  required,
  setRequired,
  nonEmpty,
  setNonEmpty,
}) {
  return (
    <>
      <div className="mb-3">
        <label htmlFor={`${idPrefix}-mode`} className={LABEL}>Growth mode</label>
        <select id={`${idPrefix}-mode`} className="rp-input font-mono" value={mode} onChange={(e) => setMode(e.target.value)} data-testid={`${testidPrefix}-mode-select`}>
          <option value="growth">Growth</option>
          <option value="steady">Steady</option>
          <option value="claimed">Claimed</option>
        </select>
        <p className="text-xs text-quiet mt-2 leading-relaxed">{MODE_HINT[mode]}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-minnew`} className={LABEL}>Minimum new records per run</label>
          <input id={`${idPrefix}-minnew`} type="number" min="0" className="rp-input font-mono" value={minNew} onChange={(e) => setMinNew(e.target.value)} data-testid={`${testidPrefix}-minnew-input`} />
          <p className="text-xs text-quiet mt-2 leading-relaxed">0 = growth optional; 1 asserts every run adds a record.</p>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-required`} className={LABEL}>Required fields (comma-separated)</label>
          <input id={`${idPrefix}-required`} type="text" className="rp-input font-mono" placeholder="id, price, created_at" value={required} onChange={(e) => setRequired(e.target.value)} data-testid={`${testidPrefix}-required-input`} />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor={`${idPrefix}-nonempty`} className={LABEL}>Fields that must be non-empty</label>
        <input id={`${idPrefix}-nonempty`} type="text" className="rp-input font-mono" placeholder="email, customer_id" value={nonEmpty} onChange={(e) => setNonEmpty(e.target.value)} data-testid={`${testidPrefix}-nonempty-input`} />
      </div>
    </>
  );
}

export function HeartbeatField({ idPrefix = "check", testidPrefix = "check", value, onChange }) {
  return (
    <div>
      <label htmlFor={`${idPrefix}-heartbeat`} className={LABEL}>Expect a run every … hours (blank = off)</label>
      <input id={`${idPrefix}-heartbeat`} type="number" min="1" max="720" className="rp-input font-mono" placeholder="24" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`${testidPrefix}-heartbeat-input`} />
      <p className="text-xs text-quiet mt-2">Pick a little longer than your workflow's longest normal gap — a daily job wants 26–30, not 24.</p>
    </div>
  );
}
