import { useEffect, useState } from "react";
import { open, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Coins, FolderOpen, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageShell from "../components/PageShell";
import {
  apiKeyClear,
  apiKeySet,
  apiKeyStatus,
  apiTest,
  getSettings,
  saveSettings,
  picturesDir,
} from "../lib/ipc";
import { setAppearance, type Appearance } from "../lib/theme";
import { LANGUAGES, resolveLanguage } from "../i18n";
import { usePersistedState } from "../lib/persistedState";


interface Props {
  onBack: () => void;
}

const APPEARANCES: { value: Appearance; labelKey: string; icon: typeof Sun }[] = [
  { value: "system", labelKey: "settings.system", icon: Monitor },
  { value: "light", labelKey: "settings.light", icon: Sun },
  { value: "dark", labelKey: "settings.dark", icon: Moon },
];

export default function Settings({ onBack }: Props) {
  const { t } = useTranslation();
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://api.brushllm.com/v1");
  const [baseUrlT2i, setBaseUrlT2i] = useState("https://api.brushllm.com/v1");
  const [defaultModel, setDefaultModel] = useState("gpt-image-2");
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [appearance, setAppearanceState] = useState<Appearance>("system");
  const [language, setLanguageState] = useState("system");
  const [status, setStatus] = useState<string | null>(null);
  /** Whether the status line is a success (green) or an error (red). */
  const [statusOk, setStatusOk] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Save stays locked until a successful connection test. */
  const [testedOk, setTestedOk] = useState(false);
  /** Snapshot of the saved connection fields, for the dirty check. */
  const [saved, setSaved] = useState<{
    base: string;
    baseT2i: string;
    model: string;
  } | null>(null);
  /** Model ids the gateway actually serves — filled by a successful test. */
  // Survives navigating away (and app restarts within a session) so the
  // picked model stays visible after Save.
  const [availableModels, setAvailableModels] = usePersistedState<string[]>(
    "settings.availableModels",
    [],
  );

  useEffect(() => {
    apiKeyStatus().then(setHasKey);
    getSettings()
      .then((settings) => {
        setBaseUrl(settings.base_url);
        setBaseUrlT2i(settings.base_url_t2i || settings.base_url);
        setDefaultModel(settings.default_model);
        setSaved({
          base: settings.base_url,
          baseT2i: settings.base_url_t2i || settings.base_url,
          model: settings.default_model,
        });
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
            setOutputDir(pics);
            try {
              await saveSettings({ ...settings, output_dir: pics });
            } catch {
              /* shown on save anyway */
            }
          });
        }
      })
      .catch(() => {});
  }, []);

  const chooseLanguage = async (next: string) => {
    setLanguageState(next);
    const i18next = (await import("../i18n")).default;
    await i18next.changeLanguage(
      next === "system" ? resolveLanguage("system") : next,
    );
    try {
      await saveSettings({
        base_url: baseUrl.trim(),
        base_url_t2i: baseUrlT2i.trim(),
        default_model: defaultModel,
        output_dir: outputDir,
        appearance,
        language: next,
      });
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const chooseAppearance = async (next: Appearance) => {
    setAppearanceState(next);
    setAppearance(next);
    try {
      await saveSettings({
        base_url: baseUrl.trim(),
        base_url_t2i: baseUrlT2i.trim(),
        default_model: defaultModel,
        output_dir: outputDir,
        appearance: next,
        language,
      });
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const saveAll = async () => {
    setStatus(null);
    setStatusOk(false);
    setSaving(true);
    try {
      if (keyInput.trim().length > 0) {
        await apiKeySet(keyInput);
        setKeyInput("");
        setHasKey(true);
      }
      await saveSettings({
        base_url: baseUrl.trim(),
        base_url_t2i: baseUrlT2i.trim(),
        default_model: defaultModel,
        output_dir: outputDir,
        appearance,
        language,
      });
      setSaved({
        base: baseUrl.trim(),
        baseT2i: baseUrlT2i.trim(),
        model: defaultModel,
      });
      setStatusOk(true);
      setStatus(t("settings.savedStatus"));
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    try {
      await apiKeyClear();
      setHasKey(false);
      // A new key means a new round of testing: drop the old test state,
      // model list and the model picked from it.
      setTestedOk(false);
      setAvailableModels([]);
      setDefaultModel("");
      setStatusOk(true);
      setStatus(t("settings.keyRemoved"));
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const pickOutputDirFor = async (dir: string) => {
    setOutputDir(dir);
    try {
      await saveSettings({
        base_url: baseUrl.trim(),
        base_url_t2i: baseUrlT2i.trim(),
        default_model: defaultModel,
        output_dir: dir,
        appearance,
        language,
      });
      setStatusOk(true);
      setStatus(t("settings.folderSet", { dir }));
    } catch (e) {
      setStatusOk(false);
      setStatus(String(e));
    }
  };

  const pickOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      setOutputDir(dir);
      try {
        await saveSettings({
          base_url: baseUrl.trim(),
        base_url_t2i: baseUrlT2i.trim(),
          default_model: defaultModel,
          output_dir: dir,
          appearance,
          language,
        });
        setStatusOk(true);
      setStatus(t("settings.folderSet", { dir }));
      } catch (e) {
        setStatusOk(false);
      setStatus(String(e));
      }
    }
  };

  const test = async () => {
    setStatus(null);
    setStatusOk(false);
    setTesting(true);
    setTestedOk(false);
    try {
      const result = await apiTest(baseUrl.trim(), baseUrlT2i.trim(), keyInput.trim() || null);
      const text =
        `Connected — image edits: ${result.models.length} models · ` +
        `text-to-image: ${result.models_t2i.length} models`;
      setStatusOk(true);
      setStatus(`✓ ${text}`);
      setTestedOk(true);
      setAvailableModels([...new Set([...result.models, ...result.models_t2i])]);
      await message(text, { title: "Connection OK", kind: "info" });
    } catch (e) {
      const text = String(e);
      setStatusOk(false);
      setStatus(text);
      await message(text, { title: "Connection failed", kind: "error" });
    } finally {
      setTesting(false);
    }
  };

  // Unsaved-connection indicator: red when any field (or a freshly typed
  // key) differs from the saved snapshot, green once saved.
  const connectionDirty =
    saved !== null &&
    (baseUrl.trim() !== saved.base ||
      baseUrlT2i.trim() !== saved.baseT2i ||
      defaultModel !== saved.model ||
      keyInput.trim().length > 0);

  // Save stays locked until every connection field is filled in.
  const missing: string[] = [];
  if (!baseUrlT2i.trim()) missing.push("Text-to-image base URL");
  if (!baseUrl.trim()) missing.push("Image edits base URL");
  if (!hasKey && keyInput.trim().length === 0) missing.push("API key");
  if (
    !defaultModel.trim() ||
    (availableModels.length > 0 && !availableModels.includes(defaultModel))
  ) {
    missing.push("Default image model (pick from the tested list)");
  }

  return (
    <PageShell
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      onBack={onBack}
    >
      <div className="split">
        <div>
          <div className="card">
            <h2 className="card-title">
              {t("settings.connection")}
              {saved !== null &&
                (connectionDirty ? (
                  <span className="badge badge-fail" style={{ marginLeft: 8 }}>
                    {t("settings.unsaved")}
                  </span>
                ) : (
                  <span className="badge badge-ok" style={{ marginLeft: 8 }}>
                    {t("settings.saved")}
                  </span>
                ))}
            </h2>
            <div className="field">
              <label>{t("settings.t2iUrl")}</label>
              <input
                type="text"
                value={baseUrlT2i}
                onChange={(e) => {
                  setBaseUrlT2i(e.target.value);
                  setTestedOk(false);
                }}
                style={{ userSelect: "text" }}
              />
              <div className="hint">
                Generate Image → POST{" "}
                <code>{baseUrlT2i.trim().replace(/\/+$/, "")}/images/generations</code>
                <br />
                Gateway root only — must end with /v1; the path is appended
                automatically.
              </div>
            </div>
            <div className="field">
              <label>{t("settings.editsUrl")}</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setTestedOk(false);
                }}
                style={{ userSelect: "text" }}
              />
              <div className="hint">
                Every other AI tool → POST{" "}
                <code>{baseUrl.trim().replace(/\/+$/, "")}/images/edits</code>
                <br />
                Gateway root only — must end with /v1; the path is appended
                automatically.
              </div>
            </div>
            <div className="field">
              <label>{t("settings.apiKey")}</label>
              <input
                type="password"
                value={keyInput}
                placeholder={hasKey ? t("settings.keyStored") : t("settings.keyPlaceholder")}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setTestedOk(false);
                }}
                style={{ userSelect: "text" }}
              />
              <div className="hint">
                {hasKey ? (
                  <>{t("settings.keyStoredHint")}</>
                ) : (
                  <>{t("settings.keyCreateHint")}</>
                )}
              </div>
              {hasKey && (
                <button
                  className="btn btn-danger-ghost btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={removeKey}
                >
                  {t("settings.removeKey")}
                </button>
              )}
            </div>
            <div className="field">
              <label>{t("settings.defaultModel")}</label>
              {availableModels.length > 0 ? (
                <select
                  value={availableModels.includes(defaultModel) ? defaultModel : ""}
                  onChange={(e) => setDefaultModel(e.target.value)}
                >
                  <option value="" disabled>
                    {t("settings.chooseModel")}
                  </option>
                  {availableModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <div className="hint" style={{ fontWeight: 650 }}>
                    {t("settings.modelCurrent", { model: defaultModel || t("ai.modelNotSet") })}
                  </div>
                  <div className="hint">
                    Test the connection to list the models your gateway
                    serves — the default model is picked from that list.
                  </div>
                </>
              )}
              <div className="hint">
                {t("settings.modelOneHint")}
              </div>
            </div>
            <div className="row">
              <button
                className="btn btn-success"
                onClick={test}
                disabled={testing || (!hasKey && keyInput.trim().length === 0)}
                title={
                  hasKey || keyInput.trim().length > 0
                    ? undefined
                    : t("settings.enterKeyFirst")
                }
              >
                {testing ? (
                  <>
                    <span className="spinner" /> {t("settings.testing")}
                  </>
                ) : (
                  t("settings.test")
                )}
              </button>
              <button
                className="btn btn-primary"
                onClick={saveAll}
                disabled={saving || !testedOk || missing.length > 0}
                title={
                  missing.length > 0
                    ? `Missing: ${missing.join(", ")}`
                    : testedOk
                      ? undefined
                      : t("settings.testFirst")
                }
              >
                {t("common.save")}
              </button>
            </div>
            {missing.length > 0 && (
              <div className="hint" style={{ marginTop: 8, color: "var(--danger)" }}>
                {t("settings.missingFields", { fields: missing.map((m) => t(m === "Text-to-image base URL" ? "settings.missingT2i" : m === "Image edits base URL" ? "settings.missingEdits" : m === "API key" ? "settings.missingKey" : "settings.missingModel")).join(", ") })}
              </div>
            )}
            <button
              className="btn btn-block btn-credits"
              style={{ marginTop: 12 }}
              onClick={() => openUrl("https://api.brushllm.com/login")}
            >
              <Coins /> Get BrushLLM Credits
            </button>
          </div>

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
                  onClick={() => chooseLanguage(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">{t("settings.privacy")}</h2>
            <div className="field">
              <label>{t("settings.localProcessing")}</label>
              <div className="hint">
                {t("settings.localHint")}
              </div>
            </div>
            <div className="field">
              <label>{t("settings.aiRequests")}</label>
              <div className="hint">
                {t("settings.aiHint")}
              </div>
            </div>
            <div className="field">
              <label>{t("settings.telemetry")}</label>
              <div className="hint">
                {t("settings.telemetryHint")}
              </div>
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">{t("settings.about")}</h2>
            <p className="status-note" style={{ userSelect: "text" }}>
              {t("settings.aboutText")}
              <br />
              <br />
              {t("settings.aboutLocal")}
              <br />
              <br />
              {t("settings.docs")}:{" "}
              <span
                className="banner-link"
                onClick={() => openUrl("https://brushllm.com/docs")}
              >
                https://brushllm.com/docs
              </span>
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
