export default function Timeline({ runs = [], onRunClick, hero = false, testid = "run-timeline" }) {
  // Pad left with empty squares so newest is always on the right
  const total = 30;
  const empties = Math.max(0, total - runs.length);
  return (
    <div className={`flex items-center gap-1 ${hero ? "tl-hero" : ""}`} data-testid={testid}>
      {Array.from({ length: empties }).map((_, i) => (
        <div key={`e-${i}`} className="tl-square" title="No run yet" />
      ))}
      {runs.map((r) => {
        const cls = r.verdict === "PASS" ? "pass" : "fail";
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onRunClick?.(r)}
            className={`tl-square ${cls}`}
            title={`${r.verdict} · ${new Date(r.timestamp).toLocaleString()}`}
            data-testid={`tl-square-${r.id}`}
          />
        );
      })}
    </div>
  );
}
