import { saveCanvasImage } from "../lib/canvas";
import { drawMask, type MaskPoint, type MaskStroke } from "../lib/mask";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Eraser, Square } from "lucide-react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useTranslation } from "react-i18next";
import { useCanvasSource } from "../lib/useCanvasSource";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { clearPersisted, usePersistedState } from "../lib/persistedState";


export default function Mosaic() {
  const { t } = useTranslation();
  const source = useCanvasSource("mosaic");
  const image = source.image;
  const [tool, setTool] = usePersistedState<"brush" | "rect" | "erase">("local.mosaic.tool", "brush");
  const [brushSize, setBrushSize] = usePersistedState("local.mosaic.brushSize", 48);
  const [blockSize, setBlockSize] = usePersistedState("local.mosaic.blockSize", 24);
  const [error, setError] = usePersistedState<string | null>("local.mosaic.error", null);
  const [busy, setBusy] = usePersistedState("local.mosaic.busy", false);
  const [savedTo, setSavedTo] = usePersistedState<string | null>("local.mosaic.savedTo", null);
  const [strokes, setStrokes] = usePersistedState<MaskStroke[]>("mosaic.strokes", []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<MaskStroke | null>(null);
  /** natural px per displayed px — export uses it to keep preview-sized
   *  blocks proportional at full resolution. */
  const previewScaleRef = useRef(1);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setError(null);
    setSavedTo(null);
    clearPersisted("mosaic.strokes");
    void source.load(path);
  };

  // Live preview: mosaic layer (downscale/upscale with smoothing off) revealed
  // only inside the painted selection.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (strokes.length === 0) return;
    // Blocks are sized for the DISPLAYED canvas, so what you see is what
    // you get — natural-resolution blocks would shrink to mush once the
    // browser scales the canvas down to fit.
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width > 0 ? rect.width : image.naturalWidth;
    const scale = image.naturalWidth / displayW;
    previewScaleRef.current = scale;
    const sw = Math.max(1, Math.round(displayW / blockSize));
    const sh = Math.max(1, Math.round(sw * image.naturalHeight / image.naturalWidth));
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(image, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, image.naturalWidth, image.naturalHeight);
    ctx.imageSmoothingEnabled = true;
    // Keep the mosaic only where strokes were painted.
    const mask = document.createElement("canvas");
    mask.width = image.naturalWidth;
    mask.height = image.naturalHeight;
    drawMask(mask, strokes, "#ffffff");
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    // Visible border around each rectangle selection.
    ctx.save();
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--focus-ring").trim();
    ctx.globalAlpha = 0.9;
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
  }, [image, strokes, blockSize]);

  const toNatural = (event: ReactPointerEvent<HTMLCanvasElement>): MaskPoint => {
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
    if (!image || busy || strokes.length === 0) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      // Mosaic layer — block size scaled from display px to natural px so
      // the exported blocks match the preview proportions.
      const blockNatural = Math.max(1, Math.round(blockSize * previewScaleRef.current));
      const sw = Math.max(1, Math.round(image.naturalWidth / blockNatural));
      const sh = Math.max(1, Math.round(image.naturalHeight / blockNatural));
      const small = document.createElement("canvas");
      small.width = sw;
      small.height = sh;
      small.getContext("2d")!.drawImage(image, 0, 0, sw, sh);
      const mosaic = document.createElement("canvas");
      mosaic.width = image.naturalWidth;
      mosaic.height = image.naturalHeight;
      const mctx = mosaic.getContext("2d")!;
      mctx.imageSmoothingEnabled = false;
      mctx.drawImage(small, 0, 0, image.naturalWidth, image.naturalHeight);
      const mask = document.createElement("canvas");
      mask.width = image.naturalWidth;
      mask.height = image.naturalHeight;
      drawMask(mask, strokes, "#ffffff");
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(mask, 0, 0);
      ctx.drawImage(mosaic, 0, 0);
      setSavedTo(await saveCanvasImage(canvas, "mosaic"));
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
    >
      {(error || source.error) && <div className="banner banner-error" role="alert">{error || source.error}</div>}
      <div className="split">
        <div className="canvas-panel">
          <div className="toolbar">
            <button
              className={`radio-chip${tool === "brush" ? " active" : ""}`}
              onClick={() => setTool("brush")}
            >
              <Circle /> {t("mosaic.brush")}
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
              <Eraser /> {t("mosaic.eraser")}
            </button>
            <label className="status-note toolbar-range">
              {t("mosaic.size")}
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
          {source.loading && <p className="status-note" role="status">{t("errors.rendering")}</p>}
          {!image && !source.loading && (
            <DropZone
              presentation="canvas"
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
          {image && (
            <>
              <div className="canvas-wrap cursor-cross">
                <img src={image.src} alt="source" draggable={false} />
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              </div>
              <p className="status-note mt-2">
                {t("mosaic.hint")}
              </p>
            </>
          )}
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("common.settingsCard")}</h2>
            <div className="field">
              <div className="range-head">
                <label className="mb-0">{t("mosaic.blockSize")}</label>
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
              disabled={!image || busy || strokes.length === 0}
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
              <div className="banner banner-ok mt-3 break-all">
                {savedTo}
              </div>
            )}
          </div>
          {image && (
            <button
              className="btn btn-block"
              disabled={busy}
              onClick={() => {
                source.clear();
                setSavedTo(null);
                setError(null);
                setStrokes([]);
              }}
            >
              {t("common.chooseDifferentImage")}
            </button>
          )}
        </div>
      </div>
    </PageShell>
  );
}
