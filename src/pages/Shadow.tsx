import { useEffect, useRef, useState, type CSSProperties } from "react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";

interface Props {
  onBack: () => void;
}

export default function Shadow({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [offsetX, setOffsetX] = useState(18);
  const [offsetY, setOffsetY] = useState(24);
  const [blur, setBlur] = useState(28);
  const [color, setColor] = useState("#1c1917");
  const [opacityPct, setOpacityPct] = useState(35);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    setSavedTo(null);
    readAssetDataUrl(path).then((url) => {
      const image = new Image();
      image.onload = () => {
        imgElRef.current = image;
        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
        setDataUrl(url);
      };
      image.src = url;
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imgElRef.current;
    if (!canvas || !image || !naturalSize) return;
    const margin = Math.ceil(blur + Math.max(Math.abs(offsetX), Math.abs(offsetY)) + 8);
    canvas.width = naturalSize.width + margin * 2;
    canvas.height = naturalSize.height + margin * 2;
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
    ctx.clearRect(margin, margin, naturalSize.width, naturalSize.height);
    ctx.drawImage(image, margin, margin);
  }, [dataUrl, naturalSize, offsetX, offsetY, blur, color, opacityPct]);

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const out = canvas.toDataURL("image/png");
      const dir = await loadDefaultOutputDir();
      if (!dir) return;
      const path = `${dir.replace(/\/+$/, "")}/shadow-${Date.now()}.png`;
      await saveBytes(path, out.slice(out.indexOf(",") + 1));
      setSavedTo(path);
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
        <label style={{ marginBottom: 0 }}>{label}</label>
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
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("shadow.dropLabel")}
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
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: 60, height: 34, padding: 2 }}
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
