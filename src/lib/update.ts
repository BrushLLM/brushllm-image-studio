import { checkUpdate } from "./ipc";
import { readPersisted, writePersisted } from "./persistedState";

const LATEST_KEY = "update.latest";

export interface UpdateBannerState {
  latest: string;
  releaseUrl: string;
}

/**
 * Startup check: silent, never throws. A successful "update available"
 * result is persisted so the Home banner survives reloads; "up to date"
 * and dismissed banners are cleared. The dismissed-version key lets the
 * user silence one specific release.
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

export function readUpdateBanner(): UpdateBannerState | null {
  const state = readPersisted<UpdateBannerState | null>(LATEST_KEY);
  return state ?? null;
}

export function dismissUpdateBanner(latest: string): void {
  writePersisted("update.dismissed", latest);
}

export function isUpdateDismissed(latest: string): boolean {
  return readPersisted<string>("update.dismissed") === latest;
}
