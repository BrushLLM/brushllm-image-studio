import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSettings } from "./lib/ipc";
import { initI18n } from "./i18n";
import { initTheme } from "./lib/theme";

// Resolve the theme and language before first paint (system defaults), then
// let App refine once the saved preferences arrive over IPC.
async function boot() {
  initTheme();
  let language = "system";
  try {
    // Never let a slow/hung IPC call block the whole UI from rendering.
    language = await Promise.race([
      getSettings().then((s) => s.language || "system"),
      new Promise<string>((resolve) => setTimeout(() => resolve("system"), 3000)),
    ]);
  } catch {
    // IPC not ready (e.g. plain browser) — system default.
  }
  try {
    await initI18n(language);
  } catch {
    // i18n failure must never blank the app — English fallback loads below.
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
