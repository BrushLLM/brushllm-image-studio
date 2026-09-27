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
    let cancelled = false;
    const timer = setTimeout(() => {
      const request = build();
      if (!request) {
        setResult(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      request
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { result, loading, error };
}
