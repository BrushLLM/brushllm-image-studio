import { useEffect, useId, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { tempDir } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Coins, Globe, Image as ImageIcon, KeyRound, X } from "lucide-react";
import CompareSlider from "../components/CompareSlider";
import DropZone from "../components/DropZone";
import MaskCanvas, { type MaskCanvasHandle } from "../components/MaskCanvas";
import PageShell from "../components/PageShell";
import { aiCancel, aiEdit, aiGenerate, apiKeyStatus, getSettings, loadDefaultOutputDir, saveBytes } from "../lib/ipc";
import { clearPersisted, readPersisted, usePersistedState, writePersisted } from "../lib/persistedState";
import { AI_FORMATS, blockedInputError, unsupportedImageError, type EditImage, type EditResult } from "../lib/types";
import { AI_TOOLS, type AiTool, type AiToolId } from "../lib/tools";
import { mergeImageFiles } from "../lib/useImageFiles";
import { useTranslation } from "react-i18next";
import i18next from "../i18n";

interface Props {
  tool: AiTool;
  onSelectTool: (toolId: AiToolId) => void;
  onOpenSettings: () => void;
}

const AI_DEFAULTS: Record<AiToolId, { prompt: string; needsMask: boolean }> = {
  "generate-image": {
    prompt: "",
    needsMask: false,
  },
  "remove-object": {
    prompt: "Remove the object in the masked area completely and reconstruct the background naturally. Keep everything outside the masked area unchanged.",
    needsMask: true,
  },
  "remove-watermark": {
    prompt: "Remove the watermark in the masked area and reconstruct the underlying image content seamlessly. Do not alter anything else.",
    needsMask: true,
  },
  "remove-background": {
    prompt: "Remove the background and replace it with a clean, pure-white background. Keep the subject exactly as it is with clean edges.",
    needsMask: false,
  },
  cutout: {
    prompt: "Isolate the main subject and cut it out onto a fully transparent background (PNG with alpha). Keep the subject edges clean and precise.",
    needsMask: false,
  },
  "generative-fill": {
    prompt: "Fill the masked area with new content that naturally continues the surrounding image in lighting, perspective and style.",
    needsMask: true,
  },
  restyle: {
    prompt: "Redraw the entire image as a watercolor painting, keeping the composition and subjects recognizable.",
    needsMask: false,
  },
  custom: {
    prompt: "",
    needsMask: true,
  },
};

const SIZES = ["auto", "1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840"];

/** The edits endpoint only accepts these tiers — no 2K/4K, no custom sizes
 *  (those are generations-endpoint freeform). */
const EDIT_SIZES = ["auto", "1024x1024", "1536x1024", "1024x1536"];

/** GPT-image size rules (per gateway docs): both sides multiples of 16,
 *  max side 3840, aspect ratio <= 3:1, total pixels 655,360–8,294,400. */
function sizeError(size: string): string | null {
  // Module-level helper — use the i18next singleton for translations.
  const tr = (key: string) => i18next.t(key);
  const m = size.match(/^(\d+)x(\d+)$/);
  if (!m) return tr("ai.customFormat");
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w % 16 !== 0 || h % 16 !== 0) return tr("ai.customMult16");
  if (Math.max(w, h) > 3840) return tr("ai.customMax");
  if (Math.max(w, h) / Math.min(w, h) > 3) return tr("ai.customRatio");
  const px = w * h;
  if (px < 655_360 || px > 8_294_400) {
    return tr("ai.customPixels");
  }
  return null;
}

function dataUrlToB64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function imageUrl(image: EditImage): string {
  return `data:${image.mime};base64,${image.image_b64}`;
}

/** File extension matching a result image's MIME type (jpeg→jpg, webp→webp,
 *  anything else→png) — a saved file must never carry a fake .png suffix. */
function extForMime(mime: string): string {
  return mime.includes("jpeg")
    ? "jpg"
    : mime.includes("webp")
      ? "webp"
      : "png";
}

export default function AiRepaint({ tool, onSelectTool, onOpenSettings }: Props) {
  const { t } = useTranslation();
  // Every AI tool is fully independent: source image, mask, prompt, result,
  // busy flag, error and generation counter all live in per-tool slots
  // (`ai.<field>.<toolId>`), so no tool can ever leak state into another.
  // Model and output size are global preferences. All of it persists
  // outside the component, so navigating away and back keeps the session.
  const { id: toolId, labelKey, descriptionKey } = tool;
  const defaults = AI_DEFAULTS[toolId];
  const generates = toolId === "generate-image";
  const toolLabel = t(labelKey);
  const formId = useId();
  const [file, setFile] = usePersistedState<string | null>(`ai.file.${toolId}`, null);
  // Optional reference images (person/object/style) sent as extra image[]
  // parts — gpt-image models only. Per-tool like everything else.
  const [refImages, setRefImages] = usePersistedState<string[]>(
    `ai.refs.${toolId}`,
    [],
  );
  const srcUrl = file ? convertFileSrc(file) : null;
  const [naturalSize, setNaturalSize] = usePersistedState<
    { width: number; height: number } | null
  >(`ai.naturalSize.${toolId}`, null);
  // Per-tool prompt: switching tools only changes the key — the stored
  // (or default) prompt of the new tool loads via the key effect. Never
  // write the prompt during a switch, that would land in the OLD tool's
  // slot and corrupt it.
  const [prompt, setPrompt] = usePersistedState(
    `ai.prompt.${toolId}`,
    defaults.prompt,
  );
  const [model, setModel] = usePersistedState("ai.model", "gpt-image-2");
  // Output size is per-mode: text-to-image keeps its own slot (SIZES plus
  // custom), edits a separate one limited to EDIT_SIZES — a generation
  // preference (e.g. 3840x2160) can never leak into the edits dropdown,
  // which offers no such option yet would silently send it to the API.
  const [sizeGen, setSizeGen] = usePersistedState("ai.size.gen", "auto");
  const [sizeEdit, setSizeEdit] = usePersistedState("ai.size.edit", "auto");
  // The active mode's size slot and setter (run/select read these).
  const size = generates ? sizeGen : sizeEdit;
  const setSize = generates ? setSizeGen : setSizeEdit;
  const [quality, setQuality] = usePersistedState("ai.quality", "auto");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = usePersistedState(`ai.busy.${toolId}`, false);
  const [customDraft, setCustomDraft] = usePersistedState("ai.customDraft", "");
  const [error, setError] = usePersistedState<string | null>(`ai.error.${toolId}`, null);
  const [result, setResult] = usePersistedState<EditResult | null>(`ai.result.${toolId}`, null);
  /** Per-tool generation counter: bumped when THIS tool's source image
   *  changes; in-flight generations from an older counter are discarded
   *  instead of polluting the new image. */
  const maskRef = useRef<MaskCanvasHandle>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  /** Fresh session for one tool: clear its result/error/busy/mask slots and
   *  bump its generation counter. */
  const resetToolSession = (id: AiToolId) => {
    const requestId = readPersisted<string>(`ai.requestId.${id}`);
    if (requestId) void aiCancel(requestId).catch(() => {});
    clearPersisted(`ai.requestId.${id}`);
    clearPersisted(`ai.result.${id}`);
    clearPersisted(`ai.error.${id}`);
    clearPersisted(`ai.busy.${id}`);
    clearPersisted(`mask.strokes.${id}`);
    clearPersisted(`ai.refs.${id}`);
    writePersisted(`ai.req.${id}`, (readPersisted<number>(`ai.req.${id}`) ?? 0) + 1);
  };

  useEffect(() => {
    apiKeyStatus().then(setHasKey).catch(() => setHasKey(false));
    getSettings()
      .then((settings) => {
        if (settings.default_model) setModel(settings.default_model);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measure the source image whenever this tool's file changes (drop,
  // Choose-different, or Send-to from another tool).
  useEffect(() => {
    if (!file || !srcUrl) return;
    const image = new Image();
    image.onload = () => {
      setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => setError(t("errors.cannotPreview"));
    image.src = srcUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, srcUrl]);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    resetToolSession(toolId);
    setNaturalSize(null);
    setSavedPath(null);
    setFile(path);
  };

  /** Hand this tool's result to another tool as its new source image. */
  const sendTo = async (targetId: AiToolId) => {
    if (!result || result.images.length === 0) return;
    const first = result.images[0];
    const dir = await tempDir();
    const path = `${dir.replace(/\/+$/, "")}/brushllm-${toolId}-${Date.now()}.${extForMime(first.mime)}`;
    try {
      await saveBytes(path, first.image_b64);
    } catch (e) {
      setError(String(e));
      return;
    }
    resetToolSession(targetId);
    clearPersisted(`ai.naturalSize.${targetId}`);
    writePersisted(`ai.file.${targetId}`, path);
    onSelectTool(targetId);
  };

  const run = async () => {
    if (!canRun) return;
    const sizeParam =
      size === "auto" ? null : size === "custom" ? customDraft.trim() : size;
    // Snapshot the session generation: if the source image changes while
    // this request is in flight, the result belongs to the OLD image and
    // must not be stored.
    // Request token: bumping it (new run, image change, cancel) invalidates
    // every older in-flight request — its result is dropped and it can no
    // longer touch this tool's busy flag.
    const myReq = (readPersisted<number>(`ai.req.${toolId}`) ?? 0) + 1;
    writePersisted(`ai.req.${toolId}`, myReq);
    const isCurrent = () =>
      readPersisted<number>(`ai.req.${toolId}`) === myReq;
    const requestId = crypto.randomUUID();
    writePersisted(`ai.requestId.${toolId}`, requestId);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const edit = generates
        ? await aiGenerate({
            requestId,
            model,
            prompt: prompt.trim(),
            size: sizeParam,
            quality: quality === "auto" ? null : quality,
          })
        : await aiEdit({
            requestId,
            model,
            prompt: prompt.trim(),
            imagePaths: file ? [file, ...refImages] : [],
            maskB64: (() => {
              const mask = maskRef.current?.getMaskDataUrl() ?? null;
              return mask ? dataUrlToB64(mask) : null;
            })(),
            size: sizeParam,
            quality: quality === "auto" ? null : quality,
          });
      if (isCurrent()) setResult(edit);
    } catch (e) {
      if (isCurrent()) setError(String(e));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        clearPersisted(`ai.requestId.${toolId}`);
      }
    }
  };

  const saveImage = async (img: EditImage) => {
    const ext = extForMime(img.mime);
    // Follow the default output folder setting: the configured folder, or
    // (when set to "each image's own folder") the folder of THIS tool's
    // source image. Only pure text-to-image results (no source) fall back
    // to the save dialog.
    const dir = await loadDefaultOutputDir();
    let path: string | null;
    if (dir) {
      path = `${dir.replace(/\/+$/, "")}/brushllm-${toolId}-${Date.now()}.${ext}`;
    } else {
      path = await save({
        defaultPath: `brushllm-${Date.now()}.${ext}`,
        filters: [{ name: "Image", extensions: [ext] }],
      });
    }
    if (!path) return;
    try {
      await saveBytes(path, img.image_b64);
      setSavedPath(path);
    } catch (e) {
      setError(String(e));
    }
  };

  const customSize = size === "custom";
  const customSizeInvalid = customSize && customDraft.trim() !== ""
    ? sizeError(customDraft.trim())
    : customSize
      ? t("ai.customEmpty")
      : null;
  const canRun =
    hasKey === true && prompt.trim().length > 0 &&
    (generates || Boolean(file && naturalSize)) &&
    !busy &&
    customSizeInvalid === null;
  const insufficientCredits = error !== null && /402|insufficient balance/i.test(error);

  const controlsCard = (
    <div className="card">
      <h2 className="card-title">
        {generates ? t("ai.describe") : t("ai.instructions")}
      </h2>
      <div className="field">
        <label htmlFor={`${formId}-prompt`}>{generates ? t("ai.prompt") : t("ai.promptPrefilled")}</label>
        <textarea
          id={`${formId}-prompt`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            generates
              ? t("ai.promptPlaceholderGen")
              : t("ai.promptPlaceholderEdit")
          }
        />
      </div>
      <div className="field">
        <label>{t("settings.defaultModel")}</label>
        <div className="hint selectable">
          {model ? t("ai.modelHint", { model }) : t("ai.modelHint", { model: t("ai.modelNotSet") })}
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${formId}-size`}>{t("ai.outputSize")}</label>
        <select
          id={`${formId}-size`}
          value={size}
          onChange={(e) => setSize(e.target.value)}
        >
          {(generates ? SIZES : EDIT_SIZES).map((s) => (
            <option key={s} value={s}>
              {s === "auto" ? (generates ? t("ai.autoGen") : t("ai.autoEdit")) : s}
            </option>
          ))}
          {generates && <option value="custom">{t("ai.custom")}</option>}
        </select>
        {!generates && (
          <div className="hint">
            {t("ai.editSizeHint")}
          </div>
        )}
        {customSize && generates && (
          <>
            <input
              type="text"
              value={customDraft}
              placeholder={t("ai.customPlaceholder")}
              onChange={(e) => setCustomDraft(e.target.value)}
              style={{ userSelect: "text", marginTop: 8 }}
            />
            {customSizeInvalid && (
              <div className="hint" style={{ color: "var(--danger)" }}>
                {customSizeInvalid}
              </div>
            )}
            {!customSizeInvalid && (
              <div className="hint">
                {t("ai.customRules")}
              </div>
            )}
          </>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${formId}-quality`}>{t("ai.quality")}</label>
        <select
          id={`${formId}-quality`}
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
        >
          <option value="auto">{t("ai.qualityAuto")}</option>
          <option value="low">{t("ai.qualityLow")}</option>
          <option value="medium">{t("ai.qualityMedium")}</option>
          <option value="high">{t("ai.qualityHigh")}</option>
        </select>
      </div>
      <aside className="ai-preflight">
        <p id={`${formId}-disclosure`}><Globe className="ai-network-icon" aria-hidden="true" /> <span>{t("ai.requestDisclosure")}</span></p>
        {hasKey === null && <p role="status">{t("ai.checkingKey")}</p>}
        {hasKey === false && (
          <p className="ai-key-notice">
            <KeyRound aria-hidden="true" />
            <span>
              {t("ai.noKey")}{" "}
              <button type="button" className="banner-link" onClick={onOpenSettings}>{t("ai.addKey")}</button>
            </span>
          </p>
        )}
      </aside>
      <button className="btn btn-primary btn-block" onClick={run} disabled={!canRun}
        aria-describedby={`${formId}-disclosure`}>
        {busy ? (
          <>
            <span className="spinner" /> {generates ? t("common.generating") : t("common.regenerating")}
          </>
        ) : (
          result ? t("common.retry") : toolLabel
        )}
      </button>
      {busy && (
        <button
          className="btn btn-block btn-danger mt-2"
          onClick={() => {
            const requestId = readPersisted<string>(`ai.requestId.${toolId}`);
            if (requestId) void aiCancel(requestId).catch((e) => setError(String(e)));
            clearPersisted(`ai.requestId.${toolId}`);
            // Invalidate any result racing with cancellation.
            writePersisted(
              `ai.req.${toolId}`,
              (readPersisted<number>(`ai.req.${toolId}`) ?? 0) + 1,
            );
            setBusy(false);
            setError(t("common.cancelled"));
          }}
        >
          {t("common.cancel")}
        </button>
      )}
      {busy && <p className="hint">{t("ai.cancelHint")}</p>}
      <button
        className="btn btn-block mt-2"
        onClick={() => openUrl("https://api.brushllm.com/login")}
      >
        <Coins aria-hidden="true" /> {t("ai.getCredits")}
      </button>
    </div>
  );

  const resultCard = result ? (
    <section className="studio-preview">
      <header className="preview-heading">
        <h2>{result.images.length > 1 ? t("ai.resultOf", { count: result.images.length }) : t("common.result")}</h2>
      </header>
      {result.images.length === 1 ? (
        <>
          <div className="preview-stage">
            {!generates && srcUrl ? (
              <CompareSlider before={srcUrl} after={imageUrl(result.images[0])} />
            ) : (
              <figure className="preview-single">
                <img src={imageUrl(result.images[0])} alt={t("common.result")} />
              </figure>
            )}
          </div>
          <div className="row mt-3">
            <button className="btn btn-primary" onClick={() => saveImage(result.images[0])}>
              {t("common.saveImage")}
            </button>
          </div>
          {savedPath && (
            <div className="banner banner-ok mt-3 break-all">
              {savedPath}
            </div>
          )}
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor={`${formId}-send`}>{t("ai.sendTo")}</label>
            <select
              id={`${formId}-send`}
              value=""
              onChange={(event) => {
                const target = AI_TOOLS.find(({ id }) => id === event.target.value);
                if (target) void sendTo(target.id);
              }}
            >
              <option value="">{t("ai.chooseTool")}</option>
              {AI_TOOLS.filter(({ id }) => id !== toolId && id !== "generate-image").map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {t(tool.labelKey)}
                </option>
              ))}
            </select>
            <div className="hint">{t("ai.sendToHint")}</div>
          </div>
        </>
      ) : (
        <>
          <div className="result-grid">
            {result.images.map((img, index) => (
              <figure key={index} className="result-grid-item">
                <img src={imageUrl(img)} alt={t("common.result")} />
                <figcaption>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => { setSavedPath(null); saveImage(img); }}
                  >
                    {t("ai.saveN", { index: index + 1 })}
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      {result.revised_prompt && (
        <p className="status-note" style={{ userSelect: "text", marginTop: 10 }}>
          {t('ai.modelInterpreted', { prompt: result.revised_prompt })}
        </p>
      )}
    </section>
  ) : busy ? (
    <section className="studio-preview" aria-busy="true" aria-label={t("common.generating")}>
      <header className="preview-heading"><h2>{t("common.generating")}</h2></header>
      <div className="preview-stage preview-empty">
        <p className="status-note">{t("ai.generatingHint")}</p>
      </div>
    </section>
  ) : null;

  return (
    <PageShell title={toolLabel} subtitle={t(descriptionKey)}>
      {error && (
        <div className="banner banner-error" role="alert">
          <span>
            {error}
            {insufficientCredits && (
              <>
                {" "}
                <button type="button" className="banner-link" onClick={() => openUrl("https://api.brushllm.com/login")}>
                  {t("ai.getCredits")}
                </button>
              </>
            )}
          </span>
        </div>
      )}

      <div className="split">
        <div className="workbench-main">
          {resultCard}
          {generates && !resultCard && (
            <section className="studio-preview">
              <header className="preview-heading"><h2>{t("common.result")}</h2></header>
              <div className="preview-stage preview-empty">
                <ImageIcon aria-hidden="true" />
                <p className="status-note">{t("ai.resultEmpty")}</p>
              </div>
            </section>
          )}
          {!generates && (
            file && srcUrl && naturalSize ? (
              <>
                <section className="canvas-panel">
                  <header className="preview-heading">
                    <h2>{t("common.preview")}</h2>
                    <button type="button" className="btn btn-sm" onClick={() => {
                      resetToolSession(toolId);
                      setFile(null);
                    }}>
                      {t("common.chooseDifferentImage")}
                    </button>
                  </header>
                  <MaskCanvas
                    ref={maskRef}
                    src={srcUrl}
                    naturalSize={naturalSize}
                    persistKey={`mask.strokes.${toolId}`}
                  />
                  <p className="status-note mt-2">
                    {defaults.needsMask
                      ? t("ai.maskHint", { tool: toolLabel })
                      : t("ai.maskNoNeed", { tool: toolLabel })}
                  </p>
                </section>
                <section className="card">
                  <h2 className="card-title">{t("ai.refImages")}</h2>
                  {refImages.length < 3 && (
                    <DropZone
                      onFiles={(paths) => {
                        setRefImages((prev) => mergeImageFiles(prev, paths).slice(0, 3));
                      }}
                      label={t("ai.refDrop")}
                      hint={t("ai.refMax")}
                      accept={AI_FORMATS}
                      onUnsupported={(files) => setError(unsupportedImageError(files.length, "JPEG or PNG"))}
                      onBlockedInput={(files) => setError(blockedInputError(files))}
                    />
                  )}
                  {refImages.length > 0 && (
                    <div className="queue mt-3">
                      {refImages.map((path, index) => (
                        <div className="queue-item" key={path}>
                          <button
                            type="button"
                            className="q-remove"
                            aria-label={`${t("common.remove")} ${index + 1}`}
                            onClick={() => setRefImages((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <X aria-hidden="true" />
                          </button>
                          <img src={convertFileSrc(path)} alt="" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="status-note mt-2">{t("ai.refHint")}</p>
                </section>
              </>
            ) : (
              <DropZone
                presentation="canvas"
                onFiles={loadFile}
                label={t("ai.dropLabel")}
                multiple={false}
                accept={AI_FORMATS}
                hint={t("ai.dropHint")}
                onUnsupported={(files) => setError(unsupportedImageError(files.length, "JPEG or PNG"))}
                onBlockedInput={(files) => setError(blockedInputError(files))}
              />
            )
          )}
        </div>
        <div className="side-col">{controlsCard}</div>
      </div>
    </PageShell>
  );
}
