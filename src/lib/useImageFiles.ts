import { useCallback, useState } from "react";

export function useImageFiles(initial: string[] = []) {
  const [files, setFiles] = useState<string[]>(initial);
  const add = useCallback((paths: string[]) => {
    setFiles((prev) => [...prev, ...paths.filter((p) => !prev.includes(p))]);
  }, []);
  const remove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);
  const clear = useCallback(() => setFiles([]), []);
  const replace = useCallback((paths: string[]) => setFiles(paths), []);
  return { files, add, remove, clear, replace };
}
