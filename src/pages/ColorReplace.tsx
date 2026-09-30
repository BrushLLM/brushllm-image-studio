import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
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

/** One source → target replacement rule. */
interface ColorPair {
  id: number;
  source: Rgb | null;
  target: string;
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
 * Apply every pair in order. A pixel is claimed by the FIRST rule that
 * matches it (later pairs never re-process rewritten pixels). The normal
 * case swaps only the hue and keeps the pixel's saturation/value, so
 * shadows, highlights and texture survive; strength falls off smoothly
 * toward the tolerance edge so there are no hard seams. Two special
 * cases matter just as much: a GRAY source has no hue to match on (it
 * matches on brightness instead and must adopt the target's saturation,
 * otherwise the swap is invisible), and a NEUTRAL target (white/black/
 * gray) has no meaningful hue (pixels must desaturate and move toward
 * the target's brightness instead).
 */
function replaceColors(
  data: Uint8ClampedArray,
  pairs: { source: Rgb; target: string }[],
  tolerance: number,
) {
  const rules = pairs.map(({ source, target }) => {
    const [fh, fs, fv] = rgbToHsv(source);
    const [th, ts, tv] = rgbToHsv(hexToRgb(target));
    return { fh, fs, fv, th, ts, tv };
  });
  const tolHue = (tolerance / 100) * 60;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv({ r: data[i], g: data[i + 1], b: data[i + 2] });
    for (const { fh, fs, fv, th, ts, tv } of rules) {
      let match: number;
      let mixed: Rgb;
      if (fs < 0.12 && s < 0.12) {
        // Grayscale source → match on value distance.
        match = 1 - Math.min(1, Math.abs(v - fv) / 0.25);
        // Gray pixels carry no hue: take the target's saturation (and
        // brightness for neutral targets) so the change is visible.
        mixed = ts < 0.12 ? hsvToRgb(th, 0, tv) : hsvToRgb(th, ts, v);
      } else {
        const dh = hueDist(h, fh);
        const ds = Math.abs(s - fs);
        match = dh <= tolHue ? 1 - dh / Math.max(1, tolHue) : 0;
        // Very unsaturated pixels of any hue are not "the source color".
        if (s < 0.08) match = 0;
        match *= 1 - Math.min(1, ds / 0.9);
        if (ts < 0.12) {
          // Neutral target: hue is meaningless — desaturate and move
          // toward the target's brightness instead.
          mixed = hsvToRgb(h, 0, tv);
        } else {
          // Hue swap; the pixel keeps its own saturation and value.
          mixed = hsvToRgb(th, s, v);
        }
      }
      if (match <= 0) continue;
      data[i] = Math.round(data[i] + (mixed.r - data[i]) * match);
      data[i + 1] = Math.round(data[i + 1] + (mixed.g - data[i + 1]) * match);
      data[i + 2] = Math.round(data[i + 2] + (mixed.b - data[i + 2]) * match);
      break; // first matching rule wins for this pixel
    }
  }
}

const PREVIEW_MAX = 1400;
const MAX_PAIRS = 6;

let pairId = 1;

export default function ColorReplace({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [pairs, setPairs] = useState<ColorPair[]>([{ id: 0, source: null, target: "#3b82f6" }]);
  const [tolerance, setTolerance] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const activePairs = pairs.filter((p): p is ColorPair & { source: Rgb } => p.source !== null);
  // The pair the next image click will fill (highlighted in the list).
  const nextIdx = pairs.findIndex((p) => p.source === null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    setSavedTo(null);
    setPairs([{ id: pairId++, source: null, target: "#3b82f6" }]);
    readAssetDataUrl(path).then((url) => {
      const image = new Image();
      image.onload = () => {
        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
        const scale = Math.min(1, PREVIEW_MAX / Math.max(image.naturalWidth, image.naturalHeight));
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
    if (activePairs.length > 0) {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      replaceColors(img.data, activePairs, tolerance);
      ctx.putImageData(img, 0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUrl, pairs, tolerance]);

  // Clicking the image picks a source color: it fills the first pair without
  // one, or starts a new pair when every existing pair already has a source.
  const pickSource = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    // Sample from the ORIGINAL offscreen (pre-replacement) copy.
    const orig = offscreenRef.current!
      .getContext("2d")!
      .getImageData(x, y, 1, 1).data;
    const picked: Rgb = { r: orig[0], g: orig[1], b: orig[2] };
    setPairs((prev) => {
      const idx = prev.findIndex((p) => p.source === null);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], source: picked };
        return next;
      }
      if (prev.length < MAX_PAIRS) {
        return [...prev, { id: pairId++, source: picked, target: "#3b82f6" }];
      }
      return prev;
    });
  };

  const exportImage = async () => {
    if (!naturalSize || !dataUrl || activePairs.length === 0) return;
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
      replaceColors(img.data, activePairs, tolerance);
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
              <canvas
                ref={canvasRef}
                onClick={pickSource}
                style={{ position: "static", maxWidth: "100%", maxHeight: 480 }}
              />
            </div>
            <p className="status-note" style={{ marginTop: 8 }}>
              {t("recolor.hint")}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("recolor.pairs")}</h2>
              <p className="hint" style={{ marginBottom: 12 }}>{t("recolor.pairHint")}</p>
              {pairs.map((pair, index) => (
                <div
                  className="field"
                  key={pair.id}
                  style={
                    index === nextIdx
                      ? { outline: "1.5px dashed var(--violet)", outlineOffset: 4, borderRadius: 10 }
                      : undefined
                  }
                >
                  <div className="row" style={{ alignItems: "center" }}>
                    <input
                      type="color"
                      className="swatch-input"
                      value={pair.source ? toHex(pair.source) : "#808080"}
                      onChange={(e) =>
                        setPairs((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], source: hexToRgb(e.target.value) };
                          return next;
                        })
                      }
                      title={t("recolor.pairSource")}
                    />
                    <span className="status-note" style={{ userSelect: "text", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pair.source ? toHex(pair.source).toUpperCase() : t("recolor.clickToPick")}
                    </span>
                    <ArrowRight size={14} style={{ flex: "0 0 auto", opacity: 0.6 }} />
                    <input
                      type="color"
                      className="swatch-input"
                      value={pair.target}
                      onChange={(e) =>
                        setPairs((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], target: e.target.value };
                          return next;
                        })
                      }
                      title={t("recolor.pairTarget")}
                    />
                    {pairs.length > 1 && (
                      <button
                        className="btn btn-sm"
                        style={{ flex: "0 0 auto" }}
                        onClick={() => setPairs((prev) => prev.filter((_, i) => i !== index))}
                        title={t("recolor.remove")}
                      >
                        <X />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {pairs.length < MAX_PAIRS && (
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setPairs((prev) => [...prev, { id: pairId++, source: null, target: "#3b82f6" }])
                  }
                >
                  <Plus /> {t("recolor.addPair")}
                </button>
              )}
              <div className="field" style={{ marginTop: 14 }}>
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
                disabled={busy || activePairs.length === 0}
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
                setPairs([{ id: pairId++, source: null, target: "#3b82f6" }]);
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
