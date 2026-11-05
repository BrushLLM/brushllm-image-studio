import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getSettings } from "./lib/ipc";
import i18next, { initI18n, resolveLanguage } from "./i18n";
import { initTheme } from "./lib/theme";

// Resolve the theme and language before first paint (system defaults), then
// let App refine once the saved preferences arrive over IPC.
async function boot() {
  initTheme();
  // Initialize the bundled system locale before rendering any translated UI.
  await initI18n("system");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  let language = "system";
  try {
    language = await Promise.race([
      getSettings().then((s) => s.language || "system"),
      new Promise<string>((resolve) => setTimeout(() => resolve("system"), 3000)),
    ]);
  } catch {
    // IPC not ready (e.g. plain browser) — system default.
  }
  try {
    await i18next.changeLanguage(resolveLanguage(language));
  } catch {
    // i18n failure must never blank the app — English fallback stays.
  }
}

boot();
