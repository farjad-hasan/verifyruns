import { useEffect } from "react";

const BASE_TITLE = "VerifyRuns — Your automation said Done. We check if that's true.";

/** Per-route document.title: "<name> — VerifyRuns", or the marketing base title when null. */
export default function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — VerifyRuns` : BASE_TITLE;
  }, [title]);
}
