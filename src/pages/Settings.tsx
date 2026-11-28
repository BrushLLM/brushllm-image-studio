import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, FolderOpen, Monitor, Moon, RotateCw, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageShell from "../components/PageShell";
import {
  checkUpdate,
  getSettings,
  saveSettings,
  picturesDir,
  type UpdateInfo,
} from "../lib/ipc";
import { setAppearance, type Appearance } from "../lib/theme";
import type { Settings as AppSettings } from "../lib/types";
import i18next, { LANGUAGES, resolveLanguage } from "../i18n";
import { version as appVersion } from "../../package.json";

const APPEARANCES: { value: Appearance; labelKey: string; icon: typeof Sun }[] = [
  { value: "system", labelKey: "settings.system", icon: Monitor },
  { value: "light", labelKey: "settings.light", icon: Sun },
  { value: "dark", labelKey: "settings.dark", icon: Moon },
];

export default function Settings() {
  const { t } = useTranslation();
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [appearance, setAppearanceState] = useState<Appearance>("system");
  const [language, setLanguageState] = useState("system");
  const [status, setStatus] = useState<string | null>(null);
  /** Whether the status line is a success (green) or an error (red). */
  const [statusOk, setStatusOk] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  /** Last settings known to be persisted. */
  const committedRef = useRef<AppSettings | null>(null);
  useEffect(() => {
    getSettings()
      .then((settings) => {
        committedRef.current = settings;
        setOutputDir(settings.output_dir ?? null);
        if (
          settings.appearance === "light" ||
          settings.appearance === "dark" ||
          settings.appearance === "system"
        ) {
          setAppearanceState(settings.appearance);
        }
        setLanguageState(settings.language || "system");
        if (!settings.output_dir) {
          // Factory default: the OS Pictures folder (never "next to source").
          picturesDir().then(async (pics) => {
            if (!pics) return;
            // Only apply it if the user hasn't saved a different folder (or
            // anything that changed output_dir) while it was resolving.
            if (committedRef.current?.output_dir !== settings.output_dir) return;
            setOutputDir(pics);
            try {
              await savePreferences({ output_dir: pics });
            } catch (e) {
              setStatusOk(false);
              setStatus(String(e));
            }
          });
        }
      })
      .catch(() => {});
  }, []);

  /** Save a preference without changing the other settings. */
  const savePreferences = async (patch: Partial<AppSettings>) => {
    const base = committedRef.current;
    if (!base) return;
    const next = { ...base, ...patch };
    await saveSettings(next);
    committedRef.current = next;
  };

  const chooseLanguage = async (next: string) => {
    setLanguageState(next);
    await i18next.changeLanguage(
      next === "system" ? resolveLanguage("system") : next,
    );
    try {
      await savePreferences({ language: next });
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const chooseAppearance = async (next: Appearance) => {
    setAppearanceState(next);
    setAppearance(next);
    try {
      await savePreferences({ appearance: next });
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const pickOutputDirFor = async (dir: string) => {
    setOutputDir(dir);
    try {
      await savePreferences({ output_dir: dir });
      setStatusOk(true);
      setStatus(t("settings.folderSet", { dir }));
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const pickOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") await pickOutputDirFor(dir);
  };

  return (
    <PageShell title={t("settings.title")}>
      <div className="split">
        <div>
          <div className="card">
            <h2 className="card-title">{t("settings.output")}</h2>
            <div className="field">
              <label>{t("settings.defaultFolder")}</label>
              <div className="path-row">
                <div className="path-display" title={outputDir ?? ""}>
                  <FolderOpen />
                  <span>{outputDir ?? "—"}</span>
                </div>
                <button className="btn btn-sm" onClick={pickOutputDir}>
                  {t("settings.changeFolder")}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const dir = await picturesDir();
                    if (dir) await pickOutputDirFor(dir);
                  }}
                >
                  {t("settings.resetToDefault")}
                </button>
              </div>
              <div className="hint">
                {t("settings.folderHint")}
              </div>
            </div>
          </div>

          {status && (
            <div className={`banner ${statusOk ? "banner-ok" : "banner-error"}`}>
              {status}
            </div>
          )}
          <div className="card">
            <h2 className="card-title">{t("settings.privacy")}</h2>
            <div className="field">
              <label>{t("settings.localProcessing")}</label>
              <div className="hint">
                {t("settings.localHint")}
              </div>
            </div>
            <div className="field">
              <label>{t("settings.telemetry")}</label>
              <div className="hint">
                {t("settings.telemetryHint")}
              </div>
            </div>
          </div>
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("settings.appearance")}</h2>
            <div className="field">
              <label>{t("settings.theme")}</label>
              <div className="radio-row">
                {APPEARANCES.map(({ value, labelKey, icon: Icon }) => (
                  <button
                    key={value}
                    className={`radio-chip${appearance === value ? " active" : ""}`}
                    aria-pressed={appearance === value}
                    onClick={() => chooseAppearance(value)}
                  >
                    <Icon />
                    {t(labelKey)}
                  </button>
                ))}
              </div>
              <div className="hint">
                {t("settings.themeHint")}
              </div>
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">{t("settings.language")}</h2>
            <div className="lang-grid">
              {LANGUAGES.map(({ value, label }) => (
                <button
                  key={value}
                  className={`radio-chip${language === value ? " active" : ""}`}
                  aria-pressed={language === value}
                  title={label}
                  onClick={() => chooseLanguage(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">{t("settings.about")}</h2>
            <p className="status-note">{t("settings.aboutText")}</p>

            <div className="field" style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 14 }}>
              <div className="range-head">
                <label className="mb-0">{t("settings.version")}</label>
                <span className="status-note selectable">
                  v{updateInfo?.current ?? appVersion}
                </span>
              </div>
              <div className="row mt-3">
                <button
                  className="btn flex-fix"
                  disabled={checking}
                  onClick={async () => {
                    setChecking(true);
                    setUpdateError(null);
                    try {
                      setUpdateInfo(await checkUpdate());
                    } catch (e) {
                      setUpdateInfo(null);
                      setUpdateError(String(e));
                    } finally {
                      setChecking(false);
                    }
                  }}
                >
                  {checking ? (
                    <>
                      <span className="spinner" /> {t("settings.checking")}
                    </>
                  ) : (
                    <>
                      <RotateCw size={14} style={{ strokeWidth: 1.8 }} /> {t("settings.checkUpdate")}
                    </>
                  )}
                </button>
              </div>

              {updateError && (
                <div className="banner banner-error mt-3">
                  {t("settings.updateCheckFailed")}
                </div>
              )}
              {updateInfo && !updateInfo.update_available && (
                <div className="banner banner-ok mt-3">
                  {t("settings.upToDate", { version: updateInfo.latest })}
                </div>
              )}
              {updateInfo?.update_available && (
                <div className="banner banner-info mt-3">
                  <div style={{ fontWeight: 650 }}>
                    {t("settings.updateAvailable", { version: updateInfo.latest })}
                  </div>
                  <div className="row mt-2">
                    <button
                      className="btn btn-primary flex-fix"
                      onClick={() => openUrl(updateInfo.release_url)}
                    >
                      <ExternalLink size={14} style={{ strokeWidth: 1.8 }} /> {t("settings.openReleasePage")}
                    </button>
                  </div>
                  {updateInfo.notes.trim() && (
                    <details className="mt-2">
                      <summary className="status-note" style={{ cursor: "pointer" }}>
                        {t("settings.updateNotes")}
                      </summary>
                      <pre
                        className="status-note"
                        style={{ whiteSpace: "pre-wrap", userSelect: "text", maxHeight: 200, overflow: "auto", margin: "8px 0 0" }}
                      >
                        {updateInfo.notes}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
