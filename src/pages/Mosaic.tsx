import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Eraser, Square } from "lucide-react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { clearPersisted, usePersistedState } from "../lib/persistedState";

interface Props {
  onBack: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  tool: "brush" | "rect" | "erase";
  points: Point[];
  size: number;
}

/** Draw one stroke onto a context in natural coordinates. */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string) {
  ctx.save();
  if (stroke.tool === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
  } else {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
  }
  if (stroke.tool === "rect") {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    if (start && end) {
      ctx.fillRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
      );
    }
  } else {
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const first = stroke.points[0];
    if (stroke.points.length === 1 && first) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawAll(canvas: HTMLCanvasElement, strokes: Stroke[], color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(ctx, stroke, color);
}

export default function Mosaic({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [tool, setTool] = useState<"brush" | "rect" | "erase">("brush");
  const [brushSize, setBrushSize] = useState(48);
  const [blockSize, setBlockSize] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [strokes, setStrokes] = usePersistedState<Stroke[]>("mosaic.strokes", []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const activeRef = useRef<Stroke | null>(null);
  /** natural px per displayed px — export uses it to keep preview-sized
   *  blocks proportional at full resolution. */
  const previewScaleRef = useRef(1);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    setSavedTo(null);
    clearPersisted("mosaic.strokes");
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

  // Live preview: mosaic layer (downscale/upscale with smoothing off) revealed
  // only inside the painted selection.
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imgElRef.current;
    if (!canvas || !image || !naturalSize) return;
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (strokes.length === 0) return;
    // Blocks are sized for the DISPLAYED canvas, so what you see is what
    // you get — natural-resolution blocks would shrink to mush once the
    // browser scales the canvas down to fit.
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width > 0 ? rect.width : naturalSize.width;
    const scale = naturalSize.width / displayW;
    previewScaleRef.current = scale;
    const sw = Math.max(1, Math.round(displayW / blockSize));
    const sh = Math.max(1, Math.round(sw * naturalSize.height / naturalSize.width));
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(image, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, naturalSize.width, naturalSize.height);
    ctx.imageSmoothingEnabled = true;
    // Keep the mosaic only where strokes were painted.
    const mask = document.createElement("canvas");
    mask.width = naturalSize.width;
    mask.height = naturalSize.height;
    drawAll(mask, strokes, "#ffffff");
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    // Visible border around each rectangle selection.
    ctx.save();
    ctx.strokeStyle = "rgba(124, 58, 237, 0.9)";
    ctx.lineWidth = Math.max(1.5, 2 * previewScaleRef.current);
    for (const stroke of strokes) {
      if (stroke.tool !== "rect") continue;
      const start = stroke.points[0];
      const end = stroke.points[stroke.points.length - 1];
      if (!start || !end) continue;
      ctx.strokeRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
      );
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUrl, naturalSize, strokes, blockSize]);

  const toNatural = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, ((event.clientX - rect.left) / rect.width) * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, ((event.clientY - rect.top) / rect.height) * canvas.height)),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const size = tool === "rect" ? 0 : Math.max(2, brushSize);
    activeRef.current = { tool, points: [toNatural(event)], size };
    setStrokes((prev) => [...prev, activeRef.current!]);
  };

  const rafRef = useRef(0);
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active) return;
    const point = toNatural(event);
    if (active.tool === "rect") {
      active.points = [active.points[0], point];
    } else {
      active.points.push(point);
    }
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setStrokes((prev) => [...prev]);
    });
  };

  const onPointerUp = () => {
    activeRef.current = null;
  };

  const exportImage = async () => {
    const image = imgElRef.current;
    if (!image || !naturalSize) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = naturalSize.width;
      canvas.height = naturalSize.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      // Mosaic layer — block size scaled from display px to natural px so
      // the exported blocks match the preview proportions.
      const blockNatural = Math.max(1, Math.round(blockSize * previewScaleRef.current));
      const sw = Math.max(1, Math.round(naturalSize.width / blockNatural));
      const sh = Math.max(1, Math.round(naturalSize.height / blockNatural));
      const small = document.createElement("canvas");
      small.width = sw;
      small.height = sh;
      small.getContext("2d")!.drawImage(image, 0, 0, sw, sh);
      const mosaic = document.createElement("canvas");
      mosaic.width = naturalSize.width;
      mosaic.height = naturalSize.height;
      const mctx = mosaic.getContext("2d")!;
      mctx.imageSmoothingEnabled = false;
      mctx.drawImage(small, 0, 0, naturalSize.width, naturalSize.height);
      const mask = document.createElement("canvas");
      mask.width = naturalSize.width;
      mask.height = naturalSize.height;
      drawAll(mask, strokes, "#ffffff");
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(mask, 0, 0);
      ctx.drawImage(mosaic, 0, 0);
      const out = canvas.toDataURL("image/png");
      const dir = await loadDefaultOutputDir();
      if (!dir) return;
      const path = `${dir.replace(/\/+$/, "")}/mosaic-${Date.now()}.png`;
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
      title={t("mosaic.title")}
      subtitle={t("mosaic.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("mosaic.dropLabel")}
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
            <div className="toolbar">
              <button
                className={`radio-chip${tool === "brush" ? " active" : ""}`}
                onClick={() => setTool("brush")}
              >
                <Circle /> {t("ai.brush")}
              </button>
              <button
                className={`radio-chip${tool === "rect" ? " active" : ""}`}
                onClick={() => setTool("rect")}
              >
                <Square /> {t("annotate.rect")}
              </button>
              <button
                className={`radio-chip${tool === "erase" ? " active" : ""}`}
                onClick={() => setTool("erase")}
              >
                <Eraser /> {t("ai.eraser")}
              </button>
              <label className="status-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {t("ai.size")}
                <input
                  type="range"
                  className="range"
                  min={8}
                  max={160}
                  value={brushSize}
                  style={{ "--val": `${((brushSize - 8) / 152) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </label>
              <span className="spacer" />
              <button
                className="btn btn-sm"
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                disabled={strokes.length === 0}
              >
                {t("common.undo")}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setStrokes([])}
                disabled={strokes.length === 0}
              >
                {t("common.clear")}
              </button>
            </div>
            <div className="canvas-wrap" style={{ cursor: "crosshair" }}>
              <img src={dataUrl} alt="source" draggable={false} />
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
            <p className="status-note" style={{ marginTop: 8 }}>
              {t("mosaic.hint")}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("common.settingsCard")}</h2>
              <div className="field">
                <div className="range-head">
                  <label style={{ marginBottom: 0 }}>{t("mosaic.blockSize")}</label>
                  <span className="range-value">{blockSize}px</span>
                </div>
                <input
                  type="range"
                  className="range"
                  min={2}
                  max={320}
                  value={blockSize}
                  style={{ "--val": `${((blockSize - 2) / 318) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setBlockSize(Number(e.target.value))}
                />
                <div className="preset-chips">
                  {[2, 4, 8, 16].map((v) => (
                    <button
                      key={v}
                      className={`chip${blockSize === v ? " active" : ""}`}
                      onClick={() => setBlockSize(v)}
                    >
                      {v}px
                    </button>
                  ))}
                </div>
                <div className="hint">{t("mosaic.blockHint")}</div>
              </div>
              <button
                className="btn btn-primary btn-block"
                onClick={exportImage}
                disabled={busy || strokes.length === 0}
              >
                {busy ? (
                  <>
                    <span className="spinner" /> {t("common.saving")}
                  </>
                ) : (
                  t("mosaic.saveButton")
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
                setStrokes([]);
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
