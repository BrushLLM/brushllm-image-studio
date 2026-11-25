import { useCallback, useEffect, useMemo, useState } from "react";
import { previewBatch } from "./ipc";
import { enqueuePreview } from "./previewQueue";
import type { RenderSettings } from "./types";

type PreviewRequest<T> = { build: () => Promise<T> };

/** Pass a stable callback for each set of parameters, or null with no input. */
export function usePreview<T>(
  build: (() => Promise<T>) | null,
  manual = false,
  delay = 350,
) {
  const [manualRequest, setManualRequest] = useState<PreviewRequest<T> | null>(null);
  const [settled, setSettled] = useState<{
    request: PreviewRequest<T>;
    result: T | null;
    error: string | null;
  } | null>(null);
  const refresh = useCallback(() => {
    if (build) setManualRequest({ build });
  }, [build]);
  const request = useMemo(
    () => build && (!manual || manualRequest?.build === build) ? { build } : null,
    [build, manual, manualRequest],
  );

  useEffect(() => {
    setSettled(null);
    if (!request) return;
    let current = true;
    let cancel = () => {};
    const timer = setTimeout(() => {
      cancel = enqueuePreview(async () => {
        if (!current) return;
        try {
          const result = await request.build();
          if (current) setSettled({ request, result, error: null });
        } catch (e) {
          if (current) setSettled({ request, result: null, error: String(e) });
        }
      });
    }, delay);
    return () => {
      current = false;
      clearTimeout(timer);
      cancel();
    };
  }, [request, delay]);

  const current = settled?.request === request ? settled : null;
  return {
    result: current?.result ?? null,
    error: current?.error ?? null,
    loading: request !== null && current === null,
    refresh,
  };
}

export function useBatchPreview(file: string | null, settings: RenderSettings) {
  const build = useMemo(
    () => file ? () => previewBatch(file, settings) : null,
    [file, settings],
  );
  return usePreview(build, settings.format === "avif");
}
