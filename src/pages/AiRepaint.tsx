import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { tempDir } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Zap, Coins } from "lucide-react";
import BeforeAfter from "../components/BeforeAfter";
import DropZone from "../components/DropZone";
import MaskCanvas, { type MaskCanvasHandle } from "../components/MaskCanvas";
import PageShell from "../components/PageShell";
import { aiEdit, aiGenerate, apiKeyStatus, getSettings, loadDefaultOutputDir, saveBytes } from "../lib/ipc";
import { clearPersisted, readPersisted, usePersistedState, writePersisted } from "../lib/persistedState";
import { AI_FORMATS, blockedInputError, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";
import i18next from "../i18n";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
  /** Tool to preselect when arriving from the home grid (e.g. "remove-watermark"). */
  initialToolId?: string | null;
}

interface AiTool {
  id: string;
  labelKey: string;
  prompt: string;
  /** Whether the tool normally needs a painted mask. */
  needsMask: boolean;
  /** Text-to-image: works without a source image. */
  generates: boolean;
}

const AI_TOOLS: AiTool[] = [
  {
    id: "generate-image",
    labelKey: "ai.toolGenerate",
    prompt: "",
    needsMask: false,
    generates: true,
  },
  {
    id: "remove-object",
    labelKey: "ai.toolRemoveObject",
    prompt:
      "Remove the object in the masked area completely and reconstruct the background naturally. Keep everything outside the masked area unchanged.",
    needsMask: true,
    generates: false,
  },
  {
    id: "remove-watermark",
    labelKey: "ai.toolRemoveWatermark",
    prompt:
      "Remove the watermark in the masked area and reconstruct the underlying image content seamlessly. Do not alter anything else.",
    needsMask: true,
    generates: false,
  },
  {
    id: "remove-background",
    labelKey: "ai.toolRemoveBackground",
    prompt:
      "Remove the background and replace it with a clean, pure-white background. Keep the subject exactly as it is with clean edges.",
    needsMask: false,
    generates: false,
  },
  {
    id: "cutout",
    labelKey: "ai.toolCutout",
    prompt:
      "Isolate the main subject and cut it out onto a fully transparent background (PNG with alpha). Keep the subject edges clean and precise.",
    needsMask: false,
    generates: false,
  },
  {
    id: "generative-fill",
    labelKey: "ai.toolFill",
    prompt:
      "Fill the masked area with new content that naturally continues the surrounding image in lighting, perspective and style.",
    needsMask: true,
    generates: false,
  },
  {
    id: "restyle",
    labelKey: "ai.toolRestyle",
    prompt:
      "Redraw the entire image as a watercolor painting, keeping the composition and subjects recognizable.",
    needsMask: false,
    generates: false,
  },
  {
    id: "custom",
    labelKey: "ai.toolCustom",
    prompt: "",
    needsMask: true,
    generates: false,
  },
];

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

export default function AiRepaint({ onBack, onOpenSettings, initialToolId }: Props) {
  const { t } = useTranslation();
  // Every AI tool is fully independent: source image, mask, prompt, result,
  // busy flag, error and generation counter all live in per-tool slots
  // (`ai.<field>.<toolId>`), so no tool can ever leak state into another.
  // Model and output size are global preferences. All of it persists
  // outside the component, so navigating away and back keeps the session.
  const [toolId, setToolId] = usePersistedState("ai.toolId", "remove-object");
  const activeTool = AI_TOOLS.find((t) => t.id === toolId) ?? AI_TOOLS[0];
  const [file, setFile] = usePersistedState<string | null>(`ai.file.${toolId}`, null);
  // Optional reference images (person/object/style) sent as extra image[]
  // parts — gpt-image models only. Per-tool like everything else.
  const [refImages, setRefImages] = usePersistedState<string[]>(
    `ai.refs.${toolId}`,
    [],
  );
  const [srcUrl, setSrcUrl] = usePersistedState<string | null>(`ai.srcUrl.${toolId}`, null);
  const [naturalSize, setNaturalSize] = usePersistedState<
    { width: number; height: number } | null
  >(`ai.naturalSize.${toolId}`, null);
  // Per-tool prompt: switching tools only changes the key — the stored
  // (or default) prompt of the new tool loads via the key effect. Never
  // write the prompt during a switch, that would land in the OLD tool's
  // slot and corrupt it.
  const [prompt, setPrompt] = usePersistedState(
    `ai.prompt.${toolId}`,
    activeTool.prompt,
  );
  const [model, setModel] = usePersistedState("ai.model", "gpt-image-2");
  const [size, setSize] = usePersistedState("ai.size", "auto");
  const [quality, setQuality] = usePersistedState("ai.quality", "auto");
  // Image count: the picker stays in the UI but offers 1 only — the API
  // backend does not support n > 1 yet. Restore 2–10 in the picker below
  // when it does.
  const [count, setCount] = usePersistedState("ai.n", 1);
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = usePersistedState(`ai.busy.${toolId}`, false);
  const [customDraft, setCustomDraft] = usePersistedState("ai.customDraft", "");
  const [error, setError] = usePersistedState<string | null>(`ai.error.${toolId}`, null);
  interface ResultImage {
    dataUrl: string;
    image_b64: string;
    mime: string;
  }
  const [result, setResult] = usePersistedState<
    { images: ResultImage[]; revised_prompt: string | null } | null
  >(`ai.result.${toolId}`, null);
  /** Per-tool generation counter: bumped when THIS tool's source image
   *  changes; in-flight generations from an older counter are discarded
   *  instead of polluting the new image. */
  const maskRef = useRef<MaskCanvasHandle>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  /** Fresh session for one tool: clear its result/error/busy/mask slots and
   *  bump its generation counter. */
  const resetToolSession = (id: string) => {
    clearPersisted(`ai.result.${id}`);
    clearPersisted(`ai.error.${id}`);
    clearPersisted(`ai.busy.${id}`);
    clearPersisted(`mask.strokes.${id}`);
    clearPersisted(`ai.refs.${id}`);
    writePersisted(`ai.req.${id}`, (readPersisted<number>(`ai.req.${id}`) ?? 0) + 1);
  };

  useEffect(() => {
    apiKeyStatus().then(setHasKey);
    getSettings()
      .then((settings) => {
        if (settings.default_model) setModel(settings.default_model);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving from the home grid with a specific tool preselected.
  useEffect(() => {
    if (!initialToolId) return;
    const tool = AI_TOOLS.find((t) => t.id === initialToolId);
    // Only switch the tool — its prompt loads from the tool's own slot.
    if (tool) setToolId(tool.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToolId]);

  // Measure the source image whenever this tool's file changes (drop,
  // Choose-different, or Send-to from another tool).
  useEffect(() => {
    if (!file || !srcUrl) return;
    const image = new Image();
    image.onload = () => {
      setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = srcUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, srcUrl]);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    resetToolSession(toolId);
    setFile(path);
    setSrcUrl(convertFileSrc(path));
  };

  /** Hand this tool's result to another tool as its new source image. */
  const sendTo = async (targetId: string) => {
    if (!result || result.images.length === 0) return;
    const first = result.images[0];
    const dir = await tempDir();
    const path = `${dir.replace(/\/+$/, "")}/brushllm-${toolId}-${Date.now()}.png`;
    try {
      await saveBytes(path, first.image_b64);
    } catch (e) {
      setError(String(e));
      return;
    }
    resetToolSession(targetId);
    writePersisted(`ai.file.${targetId}`, path);
    writePersisted(`ai.srcUrl.${targetId}`, convertFileSrc(path));
    setToolId(targetId);
  };

  const run = async () => {
    if (busy || !prompt.trim()) return;
    if (!activeTool.generates && !file) return;
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
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const edit = activeTool.generates
        ? await aiGenerate({
            model,
            prompt: prompt.trim(),
            size: sizeParam,
            quality: quality === "auto" ? null : quality,
            n: count > 1 ? count : null,
          })
        : await aiEdit({
            model,
            prompt: prompt.trim(),
            imagePaths: [file!, ...refImages],
            maskB64: (() => {
              const mask = maskRef.current?.getMaskDataUrl() ?? null;
              return mask ? dataUrlToB64(mask) : null;
            })(),
            size: sizeParam,
            quality: quality === "auto" ? null : quality,
            n: count > 1 ? count : null,
          });
      if (isCurrent()) {
        setResult({
          images: edit.images.map((img) => ({
            dataUrl: `data:${img.mime};base64,${img.image_b64}`,
            image_b64: img.image_b64,
            mime: img.mime,
          })),
          revised_prompt: edit.revised_prompt,
        });
      }
    } catch (e) {
      if (isCurrent()) setError(String(e));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  const saveImage = async (img: ResultImage) => {
    const ext = img.mime.includes("jpeg")
      ? "jpg"
      : img.mime.includes("webp")
        ? "webp"
        : "png";
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
    prompt.trim().length > 0 &&
    (activeTool.generates || Boolean(file)) &&
    !busy &&
    customSizeInvalid === null;
  const insufficientCredits = error !== null && /402|insufficient balance/i.test(error);

  const controlsCard = (
    <div className="card">
      <h2 className="card-title">
        {activeTool.generates ? t("ai.describe") : t("ai.instructions")}
      </h2>
      <div className="field">
        <label>{activeTool.generates ? t("ai.prompt") : t("ai.promptPrefilled")}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            activeTool.generates
              ? t("ai.promptPlaceholderGen")
              : t("ai.promptPlaceholderEdit")
          }
        />
      </div>
      <div className="field">
        <label>Model</label>
        <div className="hint" style={{ userSelect: "text" }}>
          {model ? t("ai.modelHint", { model }) : t("ai.modelHint", { model: t("ai.modelNotSet") })}
        </div>
      </div>
      <div className="field">
        <label>{t('ai.outputSize')}</label>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
        >
          {(activeTool.generates ? SIZES : EDIT_SIZES).map((s) => (
            <option key={s} value={s}>
              {s === "auto" ? (activeTool.generates ? t("ai.autoGen") : t("ai.autoEdit")) : s}
            </option>
          ))}
          {activeTool.generates && <option value="custom">{t("ai.custom")}</option>}
        </select>
        {!activeTool.generates && (
          <div className="hint">
            Image edits accept the three official tiers; 2K/4K and custom
            sizes are text-to-image only.
          </div>
        )}
        {customSize && activeTool.generates && (
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
        <label>{t('ai.quality')}</label>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
        >
          <option value="auto">{t("ai.qualityAuto")}</option>
          <option value="low">{t("ai.qualityLow")}</option>
          <option value="medium">{t("ai.qualityMedium")}</option>
          <option value="high">{t("ai.qualityHigh")}</option>
        </select>
      </div>
      <div className="field">
        <label>{t('ai.count')}</label>
        <select
          value={String(count)}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {[1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="hint">{t("ai.countHint")}</div>
      </div>
      <button className="btn btn-primary btn-block" onClick={run} disabled={!canRun}>
        {busy ? (
          <>
            <span className="spinner" /> {activeTool.generates ? t("common.generating") : t("common.regenerating")}
          </>
        ) : (
          t(activeTool.labelKey)
        )}
      </button>
      {busy && (
        <button
          className="btn btn-block btn-danger"
          style={{ marginTop: 8 }}
          onClick={() => {
            // Invalidate the in-flight request: when it eventually settles,
            // its result is dropped and it cannot touch the busy flag.
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
      <button
        className="btn btn-block btn-credits"
        style={{ marginTop: 8 }}
        onClick={() => openUrl("https://api.brushllm.com/login")}
      >
        <Coins /> {t("ai.getCredits")}
      </button>
    </div>
  );

  const resultCard = result ? (
    <div className="card">
      <h2 className="card-title">
        {result.images.length > 1 ? t("ai.resultOf", { count: result.images.length }) : t("common.result")}
      </h2>
      {result.images.length === 1 ? (
        <>
          {!activeTool.generates && srcUrl ? (
            <BeforeAfter
              before={srcUrl}
              after={result.images[0].dataUrl}
              beforeTag={t("errors.original")}
              afterTag={t("common.result")}
            />
          ) : (
            <img
              src={result.images[0].dataUrl}
              alt="generated"
              style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid var(--border)" }}
            />
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => saveImage(result.images[0])}>
              {t("common.saveImage")}
            </button>
            <button className="btn" onClick={run} disabled={busy}>
              {t("common.retry")}
            </button>
          </div>
          {savedPath && (
            <div className="banner banner-ok" style={{ marginTop: 12, wordBreak: "break-all" }}>
              {savedPath}
            </div>
          )}
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label>{t('ai.sendTo')}</label>
            <select
              value=""
              onChange={(e) => {
                const target = e.target.value;
                if (target) sendTo(target);
              }}
            >
              <option value="">{t("ai.chooseTool")}</option>
              {AI_TOOLS.filter((tool) => tool.id !== toolId).map((tool) => (
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
                <img src={img.dataUrl} alt={`result ${index + 1}`} />
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
          <button className="btn" onClick={run} disabled={busy} style={{ marginTop: 12 }}>
            Retry
          </button>
        </>
      )}
      {result.revised_prompt && (
        <p className="status-note" style={{ userSelect: "text", marginTop: 10 }}>
          {t('ai.modelInterpreted', { prompt: result.revised_prompt })}
        </p>
      )}
    </div>
  ) : busy ? (
    <div className="card">
      <h2 className="card-title">{t('common.generating')}</h2>
      <div className="skeleton" style={{ height: 260 }} />
      <p className="status-note" style={{ marginTop: 10 }}>
        {t('ai.generatingHint')}
      </p>
    </div>
  ) : null;

  return (
    <PageShell
      title={t("ai.title")}
      subtitle={t("ai.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-violet">{t("common.cloudBadge")}</span>}
    >
      {!hasKey && (
        <div className="banner banner-warn">
          <Zap size={16} />
          <span>
            {t("ai.noKey")}{" "}
            <span className="banner-link" onClick={onOpenSettings}>
              {t("ai.addKey")}
            </span>{" "}
            {t("ai.toUse")}
          </span>
        </div>
      )}

      {error && (
        <div className="banner banner-error">
          <span>
            {error}
            {insufficientCredits && (
              <>
                {" "}
                <span
                  className="banner-link"
                  onClick={() => openUrl("https://api.brushllm.com/login")}
                >
                  Add Credits →
                </span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Tool switcher — includes Generate Image; switching only changes
          the tool id, each tool's prompt/result load from its own slot. */}
      <div className="toolbar">
        {AI_TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`radio-chip${toolId === tool.id ? " active" : ""}`}
            onClick={() => setToolId(tool.id)}
          >
            {t(tool.labelKey)}
          </button>
        ))}
      </div>

      {activeTool.generates ? (
        <>
          <div style={{ maxWidth: 620, margin: "0 auto" }}>
            {controlsCard}
            {resultCard}
          </div>
        </>
      ) : (
        <>
          {!file && (
            <DropZone
              onFiles={loadFile}
              label={t("ai.dropLabel")}
              multiple={false}
              accept={AI_FORMATS}
              hint={t("ai.dropHint")}
              onUnsupported={(files) =>
                setError(unsupportedImageError(files.length, "JPEG or PNG"))
              }
              onBlockedInput={(files) => setError(blockedInputError(files))}
            />
          )}

          {file && srcUrl && naturalSize && (
            <div className="split">
              <div>
                <MaskCanvas
                  ref={maskRef}
                  src={srcUrl}
                  naturalSize={naturalSize}
                  persistKey={`mask.strokes.${toolId}`}
                />
                <p className="status-note" style={{ marginTop: 8 }}>
                  {activeTool.needsMask
                    ? t("ai.maskHint", { tool: t(activeTool.labelKey) })
                    : t("ai.maskNoNeed", { tool: t(activeTool.labelKey) })}
                </p>
                <div style={{ marginTop: 18 }}>
                  <h2 className="card-title">{t("ai.refImages")}</h2>
                  {refImages.length < 3 && (
                    <DropZone
                      onFiles={(paths) => {
                        setRefImages((prev) =>
                          [...prev, ...paths.filter((p) => !prev.includes(p))].slice(0, 3),
                        );
                      }}
                      label={t("ai.refDrop")}
                      hint={t("ai.refMax")}
                    />
                  )}
                  {refImages.length > 0 && (
                    <div className="queue" style={{ marginTop: 10 }}>
                      {refImages.map((path, index) => (
                        <div className="queue-item" key={`${path}-${index}`}>
                          <button
                            className="q-remove"
                            title={t("common.remove")}
                            onClick={() =>
                              setRefImages((prev) => prev.filter((_, i) => i !== index))
                            }
                          >
                            ✕
                          </button>
                          <img src={convertFileSrc(path)} alt="" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="status-note" style={{ marginTop: 8 }}>{t("ai.refHint")}</p>
                </div>
              </div>
              <div className="side-col">
                <button
                  className="btn btn-block btn-lemon"
                  style={{ marginBottom: 14 }}
                  onClick={() => {
                    resetToolSession(toolId);
                    setFile(null);
                  }}
                >
                  {t("common.chooseDifferentImage")}
                </button>
                {controlsCard}
                {resultCard}
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
