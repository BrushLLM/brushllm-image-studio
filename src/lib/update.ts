import { checkUpdate } from "./ipc";
import { usePersistedState, writePersisted } from "./persistedState";

const LATEST_KEY = "update.latest";
const DISMISSED_KEY = "update.dismissed";

export interface UpdateBannerState {
  latest: string;
  releaseUrl: string;
}

/**
 * Startup check: silent, never throws. A successful "update available"
 * result is stored for the current app session. A user can dismiss a
 * specific release without hiding a later one.
 */
export async function silentUpdateCheck(): Promise<void> {
  try {
    const info = await checkUpdate();
    if (info.update_available) {
      writePersisted(LATEST_KEY, {
        latest: info.latest,
        releaseUrl: info.release_url,
      } satisfies UpdateBannerState);
    } else {
      writePersisted(LATEST_KEY, null);
    }
  } catch {
    // Private repo / offline / rate-limited — nothing to surface at startup.
  }
}

export function useUpdateBanner() {
  const [latest] = usePersistedState<UpdateBannerState | null>(LATEST_KEY, null);
  const [dismissed, setDismissed] = usePersistedState<string | null>(DISMISSED_KEY, null);
  return {
    update: latest && latest.latest !== dismissed ? latest : null,
    dismiss: () => { if (latest) setDismissed(latest.latest); },
  };
}
