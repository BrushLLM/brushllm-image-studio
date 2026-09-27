import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pipette } from "lucide-react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";

interface Props {
  onBack: () => void;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsv({ r, g, b }: Rgb): [number, number, number] {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  const seg = Math.floor(h / 60) % 6;
  if (seg === 0) rgb = [c, x, 0];
  else if (seg === 1) rgb = [x, c, 0];
  else if (seg === 2) rgb = [0, c, x];
  else if (seg === 3) rgb = [0, x, c];
  else if (seg === 4) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/** Hue distance on the 0..360 ring. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Replace colors near `from` with `to`, keeping the ORIGINAL saturation and
 * value (shadows, highlights and texture survive); strength falls off
 * smoothly toward the tolerance edge so there are no hard seams.
 */
function replaceColor(
  data: Uint8ClampedArray,
  from: Rgb,
  toHexColor: string,
  tolerance: number,
) {
  const [fh, fs, fv] = rgbToHsv(from);
  const [th] = rgbToHsv(hexToRgb(toHexColor));
  // Tolerance maps to ~60° of hue at 100, scaled by how colorful the source
  // is (grayscale sources match on value instead of hue).
  const tolHue = (tolerance / 100) * 60;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv({ r: data[i], g: data[i + 1], b: data[i + 2] });
    let match: number; // 0..1 strength
    if (fs < 0.12 && s < 0.12) {
      // Grayscale source → match on value distance.
      match = 1 - Math.min(1, Math.abs(v - fv) / 0.25);
    } else {
      const dh = hueDist(h, fh);
      const ds = Math.abs(s - fs);
      match = dh <= tolHue ? 1 - dh / Math.max(1, tolHue) : 0;
      // Very unsaturated pixels of any hue are not "the source color".
      if (s < 0.08) match = 0;
      match *= 1 - Math.min(1, ds / 0.9);
    }
    if (match <= 0) continue;
    const mixed = hsvToRgb(th, s, v);
    data[i] = Math.round(data[i] + (mixed.r - data[i]) * match);
    data[i + 1] = Math.round(data[i + 1] + (mixed.g - data[i + 1]) * match);
    data[i + 2] = Math.round(data[i + 2] + (mixed.b - data[i + 2]) * match);
  }
}

const PREVIEW_MAX = 1400;

export default function ColorReplace({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [sourceColor, setSourceColor] = useState<Rgb | null>(null);
  const [targetColor, setTargetColor] = useState("#3b82f6");
  const [tolerance, setTolerance] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const previewScaleRef = useRef(1);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    setSavedTo(null);
    setSourceColor(null);
    readAssetDataUrl(path).then((url) => {
      const image = new Image();
      image.onload = () => {
        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
        const scale = Math.min(1, PREVIEW_MAX / Math.max(image.naturalWidth, image.naturalHeight));
        previewScaleRef.current = scale;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        offscreenRef.current = canvas;
        setDataUrl(url);
      };
      image.src = url;
    });
  };

  // Live preview on the scaled-down offscreen copy.
  useEffect(() => {
    const canvas = canvasRef.current;
    const off = offscreenRef.current;
    if (!canvas || !off) return;
    canvas.width = off.width;
    canvas.height = off.height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    if (sourceColor) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      replaceColor(img.data, sourceColor, targetColor, tolerance);
      ctx.putImageData(img, 0, 0);
    }
  }, [dataUrl, sourceColor, targetColor, tolerance]);

  const pickSource = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const [r, g, b] = canvas
      .getContext("2d")!
      .getImageData(x, y, 1, 1).data;
    // Sample from the ORIGINAL offscreen (pre-replacement) copy.
    const orig = offscreenRef.current!
      .getContext("2d")!
      .getImageData(x, y, 1, 1).data;
    setSourceColor({ r: orig[0], g: orig[1], b: orig[2] });
    void [r, g, b];
  };

  const exportImage = async () => {
    if (!naturalSize || !dataUrl) return;
    setBusy(true);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("load"));
        image.src = dataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = naturalSize.width;
      canvas.height = naturalSize.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      replaceColor(img.data, sourceColor!, targetColor, tolerance);
      ctx.putImageData(img, 0, 0);
      const out = canvas.toDataURL("image/png");
      const dir = await loadDefaultOutputDir();
      if (!dir) return;
      const path = `${dir.replace(/\/+$/, "")}/recolor-${Date.now()}.png`;
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
      title={t("recolor.title")}
      subtitle={t("recolor.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("recolor.dropLabel")}
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
            <div className="canvas-wrap" style={{ cursor: "crosshair" }}>
              <img src={dataUrl} alt="source" draggable={false} style={{ display: "none" }} />
              <canvas ref={canvasRef} onClick={pickSource} style={{ position: "static", maxWidth: "100%", maxHeight: 480 }} />
            </div>
            <p className="status-note" style={{ marginTop: 8 }}>
              {t("recolor.hint")}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("common.settingsCard")}</h2>
              <div className="field">
                <label>{t("recolor.sourceColor")}</label>
                <div className="row" style={{ alignItems: "center" }}>
                  <div
                    style={{
                      width: 46,
                      height: 34,
                      borderRadius: 8,
                      border: "1px solid var(--border-strong)",
                      background: sourceColor ? toHex(sourceColor) : "var(--bg-soft)",
                      flex: "0 0 auto",
                    }}
                  />
                  <span className="status-note" style={{ userSelect: "text" }}>
                    <Pipette size={13} /> {sourceColor ? toHex(sourceColor).toUpperCase() : t("recolor.clickToPick")}
                  </span>
                </div>
              </div>
              <div className="field">
                <label>{t("recolor.targetColor")}</label>
                <div className="row" style={{ alignItems: "center" }}>
                  <input
                    type="color"
                    value={targetColor}
                    onChange={(e) => setTargetColor(e.target.value)}
                    style={{ width: 60, height: 34, padding: 2, flex: "0 0 auto" }}
                  />
                  <span className="status-note" style={{ userSelect: "text" }}>
                    {targetColor.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="field">
                <div className="range-head">
                  <label style={{ marginBottom: 0 }}>{t("recolor.tolerance")}</label>
                  <span className="range-value">{tolerance}%</span>
                </div>
                <input
                  type="range"
                  className="range"
                  min={1}
                  max={100}
                  value={tolerance}
                  style={{ "--val": `${tolerance}%` } as CSSProperties}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                />
                <div className="hint">{t("recolor.toleranceHint")}</div>
              </div>
              <button
                className="btn btn-primary btn-block"
                onClick={exportImage}
                disabled={busy || !sourceColor}
              >
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
                setSourceColor(null);
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
