import { canvasDataUrl } from "../lib/canvas";
import { replaceColors, toHex, hexToRgb, type Rgb } from "../lib/colorReplacement";
import { replaceColorsOffThread } from "../lib/colorReplacementWorker";
import { usePersistedState, usePersistedRef } from "../lib/persistedState";
import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";

interface Props {
  onBack: () => void;
}

/** One source → target replacement rule. */
interface ColorPair {
  id: number;
  source: Rgb | null;
  target: string;
}

const PREVIEW_MAX = 1400;
const MAX_PAIRS = 6;

let pairId = 1;

export default function ColorReplace({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = usePersistedState<string | null>("local.colorreplace.file", null);
  const [dataUrl, setDataUrl] = usePersistedState<string | null>("local.colorreplace.dataUrl", null);
  const [naturalSize, setNaturalSize] = usePersistedState<{ width: number; height: number } | null>("local.colorreplace.naturalSize", null);
  const [pairs, setPairs] = usePersistedState<ColorPair[]>("local.colorreplace.pairs", [{ id: 0, source: null, target: "#3b82f6" }]);
  const [tolerance, setTolerance] = usePersistedState("local.colorreplace.tolerance", 25);
  const [error, setError] = usePersistedState<string | null>("local.colorreplace.error", null);
  const [busy, setBusy] = usePersistedState("local.colorreplace.busy", false);
  const [savedTo, setSavedTo] = usePersistedState<string | null>("local.colorreplace.savedTo", null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = usePersistedRef<HTMLCanvasElement | null>("local.colorreplace.offscreenRef", null);

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
      const pixels = await replaceColorsOffThread(img.data, activePairs, tolerance);
      ctx.putImageData(new ImageData(pixels, naturalSize.width, naturalSize.height), 0, 0);
      const out = await canvasDataUrl(canvas);
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
          workbench
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
            <div className="canvas-wrap cursor-cross">
              <canvas
                ref={canvasRef}
                onClick={pickSource}
                style={{ position: "static", maxWidth: "100%", maxHeight: 480 }}
              />
            </div>
            <p className="status-note mt-2">
              {t("recolor.hint")}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("recolor.pairs")}</h2>
              <p className="hint mb-3">{t("recolor.pairHint")}</p>
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
                        className="btn btn-sm flex-fix"
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
              <div className="field mt-3">
                <div className="range-head">
                  <label className="mb-0">{t("recolor.tolerance")}</label>
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
