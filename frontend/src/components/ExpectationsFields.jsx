// The expectation and heartbeat fields, rendered by both New Check and the Expectations editor
// on Check detail so their labels, hints and option text cannot diverge (design-system spec,
// "Every form control has a visible, associated label"). `idPrefix` keys the label/input pairs;
// `testidPrefix` keeps the existing `check-*` and `edit-*` test ids.

export const MODE_HINT = {
  growth: "Require net additions since the previous destination observation. A wrote claim replaces the minimum for that run.",
  steady: "The record count must stay the same. This does not check whether existing values changed.",
  claimed: "Every webhook run must send {\"wrote\": N}. Require at least N net additions since the previous observation; this does not match individual records.",
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
          <input id={`${idPrefix}-minnew`} type="number" min="0" disabled={mode !== "growth"} className="rp-input font-mono" value={minNew} onChange={(e) => setMinNew(e.target.value)} data-testid={`${testidPrefix}-minnew-input`} />
          <p className="text-xs text-quiet mt-2 leading-relaxed">{mode === "growth" ? "1 requires an addition after the baseline. 0 turns off growth checks unless you send wrote." : "Used only in Growth mode."}</p>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-required`} className={LABEL}>Required fields (comma-separated)</label>
          <input id={`${idPrefix}-required`} type="text" className="rp-input font-mono" placeholder="id, price, created_at" value={required} onChange={(e) => setRequired(e.target.value)} data-testid={`${testidPrefix}-required-input`} />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor={`${idPrefix}-nonempty`} className={LABEL}>Check newest records for empty fields</label>
        <input id={`${idPrefix}-nonempty`} type="text" className="rp-input font-mono" placeholder="email, customer_id" value={nonEmpty} onChange={(e) => setNonEmpty(e.target.value)} data-testid={`${testidPrefix}-nonempty-input`} />
        <p className="text-xs text-quiet mt-2" data-testid={`${testidPrefix}-field-scope`}>Field presence is checked across the sample. Emptiness fails when a field is missing, or is empty in the newest record and a majority of the five newest. This does not validate every row or its values.</p>
      </div>
    </>
  );
}

const COMMON_ZONES = [
  "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Istanbul",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo", "America/Mexico_City",
  "Asia/Karachi", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai", "Asia/Jakarta", "Asia/Manila",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "Africa/Lagos", "Africa/Johannesburg", "Africa/Cairo",
];

export function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const isWeekdays = (days) => Array.isArray(days) && days.length === 5 && WEEKDAYS.every((d) => days.includes(d));

/** Form state for the window: `null` = every hour counts. `days` is carried through verbatim so a
 *  day set the API accepted (e.g. [1,3,5]) survives a save that never touched it. */
export function windowFromCheck(check) {
  const w = check?.heartbeat_window;
  if (!w) return null;
  return { start: w.start, end: w.end, tz: w.tz, days: Array.isArray(w.days) && w.days.length ? [...w.days] : null };
}

/** API payload from form state; a blank cadence sends no window at all. */
export function windowToPayload(hours, w) {
  if (hours === "" || hours === null || hours === undefined || !w) return null;
  const out = { start: w.start, end: w.end, tz: w.tz.trim() };
  if (Array.isArray(w.days) && w.days.length) out.days = w.days;
  return out;
}

/** "expect a run every 1 h, 13:00–23:00 Asia/Karachi, weekdays" for the detail row. */
export function describeHeartbeat(check) {
  if (!check?.heartbeat_hours) return "(off)";
  let s = `expect a run every ${check.heartbeat_hours} h`;
  const w = check.heartbeat_window;
  if (w) {
    s += `, ${w.start}–${w.end} ${w.tz}`;
    if (Array.isArray(w.days) && w.days.length && w.days.length < 7) {
      const sorted = [...w.days].sort((a, b) => a - b);
      s += isWeekdays(sorted) ? ", weekdays" : `, ${sorted.map((d) => DAY_NAMES[d]).join("/")}`;
    }
  }
  return s;
}

export function HeartbeatField({ idPrefix = "check", testidPrefix = "check", value, onChange, window: win = null, onWindowChange }) {
  const windowed = !!win;
  const toggleWindow = (on) => {
    if (!onWindowChange) return;
    onWindowChange(on ? { start: "09:00", end: "17:00", tz: browserZone(), days: null } : null);
  };
  const weekdays = windowed && isWeekdays(win.days);
  const customDays = windowed && Array.isArray(win.days) && win.days.length && !weekdays ? [...win.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ") : null;
  const set = (k, v) => onWindowChange && onWindowChange({ ...win, [k]: v });
  return (
    <div>
      <label htmlFor={`${idPrefix}-heartbeat`} className={LABEL}>Expect a run every … hours (blank = off)</label>
      <input id={`${idPrefix}-heartbeat`} type="number" min="1" max="720" className="rp-input font-mono" placeholder="24" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`${testidPrefix}-heartbeat-input`} />
      <p className="text-xs text-quiet mt-2">Pick a little longer than your workflow's longest normal gap — a daily job wants 26–30, not 24.</p>
      {onWindowChange && value !== "" && (
        <div className="mt-3">
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-emerald-500" checked={windowed} onChange={(e) => toggleWindow(e.target.checked)} data-testid={`${testidPrefix}-heartbeat-window-toggle`} />
            <span className="text-sm text-zinc-300">Only during…
              <span className="block text-xs text-quiet">The clock stops outside these hours. An hourly job that runs 09:00–17:00 is due one active hour after its last run — not overnight.</span>
            </span>
          </label>
          {windowed && (
            <div className="mt-3 space-y-3" data-testid={`${testidPrefix}-heartbeat-window`}>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor={`${idPrefix}-hb-start`} className={LABEL}>From</label>
                  <input id={`${idPrefix}-hb-start`} type="time" className="rp-input font-mono" value={win.start} onChange={(e) => set("start", e.target.value)} data-testid={`${testidPrefix}-heartbeat-window-start`} />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-hb-end`} className={LABEL}>To</label>
                  <input id={`${idPrefix}-hb-end`} type="time" className="rp-input font-mono" value={win.end} onChange={(e) => set("end", e.target.value)} data-testid={`${testidPrefix}-heartbeat-window-end`} />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-hb-tz`} className={LABEL}>Time zone</label>
                  <input id={`${idPrefix}-hb-tz`} type="text" list={`${idPrefix}-hb-zones`} className="rp-input font-mono" value={win.tz} onChange={(e) => set("tz", e.target.value)} placeholder="Area/City" data-testid={`${testidPrefix}-heartbeat-window-tz`} />
                  <datalist id={`${idPrefix}-hb-zones`}>
                    {[browserZone(), ...COMMON_ZONES].filter((z, i, arr) => arr.indexOf(z) === i).map((z) => <option key={z} value={z} />)}
                  </datalist>
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 mt-0.5 accent-emerald-500" checked={weekdays} onChange={(e) => set("days", e.target.checked ? WEEKDAYS : null)} data-testid={`${testidPrefix}-heartbeat-window-weekdays`} />
                <span className="text-sm text-zinc-300">Weekdays only <span className="text-xs text-quiet">(Mon–Fri)</span>
                  {customDays && (
                    <span className="block text-xs text-quiet font-mono" data-testid={`${testidPrefix}-heartbeat-window-days`}>Currently {customDays} (set via the API; ticking the box replaces it)</span>
                  )}
                </span>
              </label>
              <p className="text-xs text-quiet">"To" earlier than "From" means the window runs past midnight.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
