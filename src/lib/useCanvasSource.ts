import { loadCanvasImage } from "./canvas";
import { usePersistedState } from "./persistedState";
import type { LocalToolId } from "./tools";

type CanvasSource =
  | { status: "loading" }
  | { status: "ready"; image: HTMLImageElement }
  | { status: "failed"; error: string };

export function useCanvasSource(tool: LocalToolId) {
  const [source, setSource] = usePersistedState<CanvasSource | null>(`local.${tool}.source`, null);

  const load = async (path: string) => {
    const pending: CanvasSource = { status: "loading" };
    setSource(pending);
    try {
      const image = await loadCanvasImage(path);
      setSource((current) => current === pending ? { status: "ready", image } : current);
    } catch (error) {
      setSource((current) => current === pending ? { status: "failed", error: String(error) } : current);
    }
  };

  return {
    load,
    clear: () => setSource(null),
    loading: source?.status === "loading",
    error: source?.status === "failed" ? source.error : null,
    image: source?.status === "ready" ? source.image : null,
  };
}
