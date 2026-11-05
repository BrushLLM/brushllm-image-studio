import { useCallback } from "react";
import { usePersistedState } from "./persistedState";

export function useImageFiles(slot: string, initial: string[] = []) {
  const [files, setFiles] = usePersistedState<string[]>(`local.${slot}.files`, initial);
  const add = useCallback((paths: string[]) => {
    setFiles((prev) => [...prev, ...new Set(paths.filter((p) => !prev.includes(p)))]);
  }, []);
  const remove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);
  const clear = useCallback(() => setFiles([]), []);
  const replace = useCallback((paths: string[]) => setFiles(paths), []);
  return { files, add, remove, clear, replace };
}
