import { useCallback, useEffect, useRef, useState } from "react";
import type { PreviewOutcome } from "./ipc";
import { enqueuePreview } from "./previewQueue";

/**
 * Debounced engine preview. `build` returns the request promise or null to
 * clear; the effect re-runs whenever `deps` change (spread into useEffect).
 */
export function usePreview(
  build: () => Promise<PreviewOutcome> | null,
  deps: unknown[],
  manual = false,
): { result: PreviewOutcome | null; loading: boolean; error: string | null; refresh: () => void } {
  const [result, setResult] = useState<PreviewOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);

  useEffect(() => {
    // Request token: only the LATEST request may publish results — a slow
    // earlier request resolving late can never show stale output.
    let current = true;
    let cancel = () => {};
    const requested = lastRevision.current !== revision;
    lastRevision.current = revision;
    setResult(null);
    setError(null);
    setLoading(false);
    if (manual && !requested) return;
    setLoading(true);
    const timer = setTimeout(() => {
      cancel = enqueuePreview(async () => {
        if (!current) return;
        try {
          const result = await build();
          if (current) setResult(result);
        } catch (e) {
          if (current) setError(String(e));
        } finally {
          if (current) setLoading(false);
        }
      });
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, manual, revision]);

  return { result, loading, error, refresh };
}
