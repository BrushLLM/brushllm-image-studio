import { useEffect, useRef, useState } from "react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

type OutFormat = "png" | "jpeg";

export default function RoundedCorners({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [radiusPct, setRadiusPct] = useState(15);
  const [format, setFormat] = useState<OutFormat>("png");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    readAssetDataUrl(path).then((url) => {
      const image = new Image();
      image.onload = () => {
        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
        setDataUrl(url);
      };
      image.src = url;
    });
  };

  // Redraw whenever the image, radius or format changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl || !naturalSize) return;
    const { width, height } = naturalSize;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      // Step 1: rounded image on an intermediate canvas (outside = alpha).
      const rounded = document.createElement("canvas");
      rounded.width = width;
      rounded.height = height;
      const rctx = rounded.getContext("2d")!;
      rctx.drawImage(image, 0, 0);
      const r = (Math.min(width, height) * radiusPct) / 100;
      rctx.globalCompositeOperation = "destination-in";
      rctx.beginPath();
      // Fallback for older WebViews without ctx.roundRect.
      if (typeof rctx.roundRect === "function") {
        rctx.roundRect(0, 0, width, height, r);
      } else {
        rctx.moveTo(r, 0);
        rctx.arcTo(width, 0, width, height, r);
        rctx.arcTo(width, height, 0, height, r);
        rctx.arcTo(0, height, 0, 0, r);
        rctx.arcTo(0, 0, width, 0, r);
        rctx.closePath();
      }
      rctx.fill();

      // Step 2: compose. PNG keeps the transparent corners; JPEG has no
      // alpha channel (transparent would encode as BLACK), so the rounded
      // image is placed on a white base first.
      ctx.clearRect(0, 0, width, height);
      if (format === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(rounded, 0, 0);
    };
    image.src = dataUrl;
  }, [dataUrl, naturalSize, radiusPct, format]);

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ext = format === "jpeg" ? "jpg" : "png";
    // Output straight into the default output folder — or, when it is set to
    // "each image's own folder", next to the source image. No dialog.
    const dir = await loadDefaultOutputDir();
    if (!dir) return;
    const path = `${dir.replace(/\/+$/, "")}/rounded-${Date.now()}.${ext}`;
    setBusy(true);
    try {
      let out: string;
      if (format === "jpeg") {
        // Composite the transparent-corner canvas onto white: JPEG has no
        // alpha and toDataURL flattens it onto black otherwise.
        const flat = document.createElement("canvas");
        flat.width = canvas.width;
        flat.height = canvas.height;
        const fctx = flat.getContext("2d")!;
        fctx.fillStyle = "#ffffff";
        fctx.fillRect(0, 0, flat.width, flat.height);
        fctx.drawImage(canvas, 0, 0);
        out = flat.toDataURL("image/jpeg");
      } else {
        out = canvas.toDataURL("image/png");
      }
      await saveBytes(path, out.slice(out.indexOf(",") + 1));
      setSavedTo(path);
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
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("rounded.dropLabel")}
          multiple={false}
          accept={CANVAS_FORMATS}
          hint={t("common.canvasBrowseHint")}
          onUnsupported={(files) =>
            setError(unsupportedImageError(files.length, "JPEG, PNG, WebP, GIF or BMP"))
          }
        />
      )}

      {file && dataUrl && naturalSize && (
        <div className="split">
          <div>
            <div className="preview-frame">
              <canvas ref={canvasRef} />
            </div>
            <p className="status-note" style={{ marginTop: 8 }}>
              {naturalSize.width}×{naturalSize.height}px · radius{" "}
              {Math.round((Math.min(naturalSize.width, naturalSize.height) * radiusPct) / 100)}px
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("common.settingsCard")}</h2>
              <div className="field">
                <div className="range-head">
                  <label style={{ marginBottom: 0 }}>{t("rounded.radius")}</label>
                  <span className="range-value">{radiusPct}%</span>
                </div>
                <input
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
                    onClick={() => setFormat("png")}
                  >
                    {t("rounded.pngCorners")}
                  </button>
                  <button
                    className={`radio-chip${format === "jpeg" ? " active" : ""}`}
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
                <div className="banner banner-ok" style={{ marginTop: 12, wordBreak: "break-all" }}>
                  {savedTo}
                </div>
              )}
              {error && (
                <div className="banner banner-error" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <button
              className="btn btn-block btn-lemon"
              onClick={() => {
                setFile(null);
                setDataUrl(null);
                setNaturalSize(null);
              }}
            >
              {t("common.chooseDifferentImage")}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
