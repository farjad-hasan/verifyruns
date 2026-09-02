import { useEffect, useRef } from "react";

// Newest run is always the rightmost square. On narrow screens the strip scrolls
// horizontally and starts scrolled to the end, so the newest square is always visible.
// `static` renders the real squares as non-interactive spans, for strips that sit inside a link
// or button (the dashboard row): interactive content never nests.
export default function Timeline({ runs = [], onRunClick, hero = false, total = 30, testid = "run-timeline", static: isStatic = false }) {
  const scroller = useRef(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [runs.length]);
  const empties = Math.max(0, total - runs.length);
  return (
    <div ref={scroller} className="overflow-x-auto tl-scroller" data-testid={testid}>
      <div className={`flex items-center gap-1 w-max ml-auto ${hero ? "tl-hero" : ""}`}>
        {Array.from({ length: empties }).map((_, i) => (
          <div key={`e-${i}`} className="tl-square" title="No run yet" aria-hidden="true" />
        ))}
        {runs.map((r) => {
          const cls = r.verdict === "PASS" ? "pass" : "fail";
          const label = `${r.verdict} · ${new Date(r.timestamp).toLocaleString()}`;
          if (isStatic) {
            return <span key={r.id} role="img" className={`tl-square ${cls}`} title={label} aria-label={label} data-testid={`tl-square-${r.id}`} />;
          }
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onRunClick?.(r)}
              className={`tl-square ${cls}`}
              title={label}
              aria-label={label}
              data-testid={`tl-square-${r.id}`}
            />
          );
        })}
      </div>
    </div>
  );
}
