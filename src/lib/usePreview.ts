import { useEffect, useState } from "react";
import type { PreviewOutcome } from "./ipc";

/**
 * Debounced engine preview. `build` returns the request promise or null to
 * clear; the effect re-runs whenever `deps` change (spread into useEffect).
 */
export function usePreview(
  build: () => Promise<PreviewOutcome> | null,
  deps: unknown[],
): { result: PreviewOutcome | null; loading: boolean; error: string | null } {
  const [result, setResult] = useState<PreviewOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Request token: only the LATEST request may publish results — a slow
    // earlier request resolving late can never show stale output.
    let current = true;
    const timer = setTimeout(() => {
      const request = build();
      if (!request) {
        if (!current) return;
        setResult(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (current) setLoading(true);
      request
        .then((r) => {
          if (!current) return;
          setResult(r);
          setError(null);
        })
        .catch((e) => {
          if (!current) return;
          setError(String(e));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { result, loading, error };
}
