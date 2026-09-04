import { useEffect } from "react";

const BASE_TITLE = "VerifyRuns — Check the destination after your workflow runs.";

/** Per-route document.title: "<name> — VerifyRuns", or the marketing base title when null. */
export default function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — VerifyRuns` : BASE_TITLE;
  }, [title]);
}
