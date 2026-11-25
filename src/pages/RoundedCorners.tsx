import { saveCanvasImage } from "../lib/canvas";
import { usePersistedState } from "../lib/persistedState";
import { useId } from "react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useCanvasSource } from "../lib/useCanvasSource";
import { blockedInputError, CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";

type OutFormat = "png" | "jpeg";

export default function RoundedCorners() {
  const { t } = useTranslation();
  const source = useCanvasSource("rounded");
  const radiusId = useId();
  const [radiusPct, setRadiusPct] = usePersistedState("local.rounded.radiusPct", 15);
  const [format, setFormat] = usePersistedState<OutFormat>("local.rounded.format", "png");
  const [error, setError] = usePersistedState<string | null>("local.rounded.error", null);
  const [busy, setBusy] = usePersistedState("local.rounded.busy", false);
  const [savedTo, setSavedTo] = usePersistedState<string | null>("local.rounded.savedTo", null);
  const width = source.image?.naturalWidth ?? 0;
  const height = source.image?.naturalHeight ?? 0;
  const radius = Math.min(width, height) * radiusPct / 100;

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setError(null);
    setSavedTo(null);
    void source.load(path);
  };

  const exportImage = async () => {
    if (!source.image || busy) return;
    setBusy(true);
    setError(null);
    setSavedTo(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("errors.cannotPreview"));
      if (format === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.arcTo(width, 0, width, height, radius);
      ctx.arcTo(width, height, 0, height, radius);
      ctx.arcTo(0, height, 0, 0, radius);
      ctx.arcTo(0, 0, width, 0, radius);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(source.image, 0, 0);
      setSavedTo(await saveCanvasImage(canvas, "rounded", format));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title={t("rounded.title")}
      subtitle={t("rounded.subtitle")}
    >
      {!source.image && (error || source.error) && <div className="banner banner-error" role="alert">{error || source.error}</div>}
      {source.loading && <p className="status-note" role="status">{t("errors.rendering")}</p>}
      {!source.image && !source.loading && (
        <DropZone
          presentation="canvas"
          onFiles={loadFile}
          label={t("rounded.dropLabel")}
          multiple={false}
          accept={CANVAS_FORMATS}
          hint={t("common.canvasBrowseHint")}
          onUnsupported={(files) =>
            setError(unsupportedImageError(files.length, "JPEG, PNG, WebP, BMP"))
          }
          onBlockedInput={(files) => setError(blockedInputError(files))}
        />
      )}

      {source.image && (
        <div className="split">
          <div className="canvas-panel">
            <div className="canvas-wrap" style={format === "jpeg" ? { background: "#ffffff" } : undefined}>
              <img
                src={source.image.src}
                alt={t("common.preview")}
                style={{ borderRadius: `${radius / width * 100}% / ${radius / height * 100}%` }}
              />
            </div>
            <p className="status-note mt-2">
              {width} × {height} px · {t("rounded.radius")} {Math.round(radius)} px
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("common.settingsCard")}</h2>
              <div className="field">
                <div className="range-head">
                  <label className="mb-0" htmlFor={radiusId}>{t("rounded.radius")}</label>
                  <span className="range-value">{radiusPct}%</span>
                </div>
                <input
                  id={radiusId}
                  type="range"
                  className="range"
                  min={0}
                  max={50}
                  value={radiusPct}
                  style={{ "--val": `${(radiusPct / 50) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setRadiusPct(Number(e.target.value))}
                />
                <div className="preset-chips">
                  {[5, 10, 15, 25, 50].map((v) => (
                    <button
                      key={v}
                      className={`chip${radiusPct === v ? " active" : ""}`}
                      onClick={() => setRadiusPct(v)}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                <div className="hint">{t("rounded.radiusHint")}</div>
              </div>
              <div className="field">
                <label>{t("rounded.outputFormat")}</label>
                <div className="radio-row">
                  <button
                    className={`radio-chip${format === "png" ? " active" : ""}`}
                    aria-pressed={format === "png"}
                    onClick={() => setFormat("png")}
                  >
                    {t("rounded.pngCorners")}
                  </button>
                  <button
                    className={`radio-chip${format === "jpeg" ? " active" : ""}`}
                    aria-pressed={format === "jpeg"}
                    onClick={() => setFormat("jpeg")}
                  >
                    {t("rounded.jpegCorners")}
                  </button>
                </div>
              </div>
              <button className="btn btn-primary btn-block" onClick={exportImage} disabled={busy}>
                {busy ? <><span className="spinner" /> {t("common.saving")}</> : t("common.saveImage")}
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
