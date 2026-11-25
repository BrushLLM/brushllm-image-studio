import { useEffect } from "react";
import { loadDefaultOutputDir } from "./ipc";
import { usePersistedState } from "./persistedState";
import type { LocalToolId } from "./tools";
import type { BatchJob } from "./types";

export function useOutputConfig(tool: LocalToolId, suffix: string) {
  const [output, setOutput] = usePersistedState<BatchJob["output"]>(`local.${tool}.output`, {
    dir: null,
    suffix,
    collision: "rename",
  });

  useEffect(() => {
    if (output.dir !== null) return;
    let active = true;
    void loadDefaultOutputDir().then((dir) => {
      if (active && dir) setOutput((current) => current.dir === null ? { ...current, dir } : current);
    });
    return () => { active = false; };
  }, [output.dir, setOutput]);

  return [output, setOutput] as const;
}
