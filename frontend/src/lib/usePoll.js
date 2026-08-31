import { useEffect, useRef } from "react";

/**
 * Lifecycle-aware polling: pauses while the document is hidden (one immediate refetch on return),
 * backs off on consecutive errors (interval → 3× → 60 s cap, reset on success), cleans up on
 * unmount. `fn` may return a promise; a rejection counts as an error for backoff.
 */
export default function usePoll(fn, { interval = 10000, enabled = true } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer = null;
    let errors = 0;

    const delay = () => (errors === 0 ? interval : Math.min(interval * 3 ** errors, 60000));

    const schedule = () => {
      if (stopped || document.hidden) return; // hidden: the visibility listener resumes us
      timer = setTimeout(run, delay());
    };

    async function run() {
      if (stopped || document.hidden) return;
      try {
        await fnRef.current();
        errors = 0;
      } catch {
        errors += 1;
      }
      schedule();
    }

    const onVisible = () => {
      if (!document.hidden && !stopped) {
        clearTimeout(timer);
        run(); // immediate refresh on refocus, then normal cadence
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [interval, enabled]);
}
