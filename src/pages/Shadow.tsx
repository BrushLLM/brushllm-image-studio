import { saveCanvasImage } from "../lib/canvas";
import { usePersistedState } from "../lib/persistedState";
import { useEffect, useRef, type CSSProperties } from "react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useTranslation } from "react-i18next";
import { useCanvasSource } from "../lib/useCanvasSource";
import { blockedInputError, CANVAS_FORMATS, unsupportedImageError } from "../lib/types";

export default function Shadow() {
  const { t } = useTranslation();
  const source = useCanvasSource("shadow");
  const { image } = source;
  const [offsetX, setOffsetX] = usePersistedState("local.shadow.offsetX", 18);
  const [offsetY, setOffsetY] = usePersistedState("local.shadow.offsetY", 24);
  const [blur, setBlur] = usePersistedState("local.shadow.blur", 28);
  const [color, setColor] = usePersistedState("local.shadow.color", "#1c1917");
  const [opacityPct, setOpacityPct] = usePersistedState("local.shadow.opacityPct", 35);
  const [error, setError] = usePersistedState<string | null>("local.shadow.error", null);
  const [busy, setBusy] = usePersistedState("local.shadow.busy", false);
  const [savedTo, setSavedTo] = usePersistedState<string | null>("local.shadow.savedTo", null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setError(null);
    setSavedTo(null);
    void source.load(path);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const { naturalWidth, naturalHeight } = image;
    const margin = Math.ceil(blur + Math.max(Math.abs(offsetX), Math.abs(offsetY)) + 8);
    canvas.width = naturalWidth + margin * 2;
    canvas.height = naturalHeight + margin * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = color;
    ctx.globalAlpha = opacityPct / 100;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = offsetX;
    ctx.shadowOffsetY = offsetY;
    ctx.drawImage(image, margin, margin);
    ctx.restore();
    // Draw the image once more without shadow so it sits crisply on top of
    // its own faint shadow-tinted copy.
    ctx.clearRect(margin, margin, naturalWidth, naturalHeight);
    ctx.drawImage(image, margin, margin);
  }, [image, offsetX, offsetY, blur, color, opacityPct]);

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    setError(null);
    setSavedTo(null);
    try {
      setSavedTo(await saveCanvasImage(canvas, "shadow"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    setter: (v: number) => void,
    fmt: (v: number) => string = (v) => String(v),
  ) => (
    <div className="field">
      <div className="range-head">
        <label className="mb-0">{label}</label>
        <span className="range-value">{fmt(value)}</span>
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        value={value}
        style={{ "--val": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(e) => setter(Number(e.target.value))}
      />
    </div>
  );

  return (
    <PageShell
      title={t("shadow.title")}
      subtitle={t("shadow.subtitle")}
    >
      {!image && (error || source.error) && <div className="banner banner-error" role="alert">{error || source.error}</div>}
      {source.loading && <p className="status-note" role="status">{t("errors.rendering")}</p>}
      {!image && !source.loading && (
        <DropZone
          presentation="canvas"
          onFiles={loadFile}
          label={t("shadow.dropLabel")}
          multiple={false}
          accept={CANVAS_FORMATS}
          hint={t("common.canvasBrowseHint")}
          onUnsupported={(files) =>
            setError(unsupportedImageError(files.length, "JPEG, PNG, WebP, BMP"))
          }
          onBlockedInput={(files) => setError(blockedInputError(files))}
        />
      )}

      {image && (
        <div className="split">
          <div className="canvas-panel">
            <div className="preview-frame">
              <canvas ref={canvasRef} />
            </div>
            <p className="status-note mt-2">
              {t("shadow.canvasNote")}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("common.settingsCard")}</h2>
              {slider(t("shadow.offsetX"), offsetX, -60, 60, setOffsetX, (v) => `${v}px`)}
              {slider(t("shadow.offsetY"), offsetY, -60, 60, setOffsetY, (v) => `${v}px`)}
              {slider(t("shadow.blur"), blur, 0, 80, setBlur, (v) => `${v}px`)}
              {slider(t("watermark.opacity"), opacityPct, 10, 100, setOpacityPct, (v) => `${v}%`)}
              <div className="field">
                <label>{t("watermark.color")}</label>
                <input
                  type="color" className="swatch-input"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  
                />
              </div>
              <button className="btn btn-primary btn-block" onClick={exportImage} disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" /> {t("common.saving")}
                  </>
                ) : (
                  t("common.saveImage")
                )}
              </button>
              {savedTo && !busy && (
                <div className="banner banner-ok mt-3 break-all">
                  {savedTo}
                </div>
              )}
              {error && (
                <div className="banner banner-error mt-3">
                  {error}
                </div>
              )}
            </div>
            <button
              className="btn btn-block"
              onClick={() => { source.clear(); setError(null); }}
              disabled={busy}
            >
              {t("common.chooseDifferentImage")}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
