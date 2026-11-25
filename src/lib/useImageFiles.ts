import { useCallback } from "react";
import type { LocalToolId } from "./tools";
import { usePersistedState } from "./persistedState";

export function mergeImageFiles(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming])];
}

export function useImageFiles(slot: LocalToolId) {
  const [files, setFiles] = usePersistedState<string[]>(`local.${slot}.files`, []);
  const [selected, selectPreview] = usePersistedState<string | null>(`local.${slot}.previewFile`, null);
  const previewFile = selected && files.includes(selected) ? selected : files[0] ?? null;
  const add = useCallback((paths: string[]) => {
    setFiles((prev) => mergeImageFiles(prev, paths));
  }, []);
  const remove = (index: number) => {
    if (files[index] === selected) selectPreview(null);
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };
  const clear = () => {
    setFiles([]);
    selectPreview(null);
  };
  const replace = useCallback((paths: string[]) => setFiles(paths), []);
  return { files, add, remove, clear, replace, previewFile, selectPreview };
}
