import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { usePersistedState } from "../lib/persistedState";
import { useTranslation } from "react-i18next";

export interface MaskCanvasHandle {
  /** PNG data URL (natural resolution) or null when nothing is masked. */
  getMaskDataUrl: () => string | null;
  hasMask: () => boolean;
  /** Clear all strokes (called when the source image changes). */
  clear: () => void;
}

interface Props {
  src: string;
  naturalSize: { width: number; height: number };
  /** Per-tool persistence slot for the strokes (each AI tool keeps its
   *  own mask). Defaults to a shared slot. */
  persistKey?: string;
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

type Tool = "brush" | "rect" | "erase";

const DISPLAY_COLOR = "rgba(124, 58, 237, 0.55)";

/** Draw one stroke onto a canvas context in natural coordinates. */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string) {
  ctx.save();
  if (stroke.tool === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = stroke.size;
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
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      ctx.fillRect(x, y, Math.abs(end.x - start.x), Math.abs(end.y - start.y));
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

function drawAll(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  color: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, color);
  }
}

const MaskCanvas = forwardRef<MaskCanvasHandle, Props>(function MaskCanvas(
  { src, naturalSize, persistKey = "mask.strokes" },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useTranslation();
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(48);
  // Strokes persist outside the component so navigating away and back
  // keeps the painted mask.
  const [strokes, setStrokes] = usePersistedState<Stroke[]>(persistKey, []);
  const activeStroke = useRef<Stroke | null>(null);

  useImperativeHandle(ref, () => ({
    hasMask: () => strokes.length > 0,
    clear: () => setStrokes([]),
    getMaskDataUrl: () => {
      if (strokes.length === 0) return null;
      // OpenAI edits semantics: TRANSPARENT pixels mark the region to
      // regenerate. Render the strokes (alpha = painted state), then use
      // that alpha to punch holes out of an opaque white canvas.
      const drawn = document.createElement("canvas");
      drawn.width = naturalSize.width;
      drawn.height = naturalSize.height;
      drawAll(drawn, strokes, "#ffffff");
      const out = document.createElement("canvas");
      out.width = naturalSize.width;
      out.height = naturalSize.height;
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(drawn, 0, 0);
      return out.toDataURL("image/png");
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawAll(canvas, strokes, DISPLAY_COLOR);
  }, [strokes, naturalSize.width, naturalSize.height]);

  const toNatural = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY)),
      };
    },
    [],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const size = tool === "rect" ? 0 : Math.max(2, brushSize);
    activeStroke.current = { tool, points: [toNatural(event)], size };
    setStrokes((prev) => [...prev, activeStroke.current!]);
  };

  const rafRef = useRef(0);
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke.current) return;
    const point = toNatural(event);
    const stroke = activeStroke.current;
    if (stroke.tool === "rect") {
      stroke.points = [stroke.points[0], point];
    } else {
      stroke.points.push(point);
    }
    // Coalesce redraws to one per frame — high-frequency pointer events
    // no longer trigger a React render each.
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setStrokes((prev) => [...prev]);
    });
  };

  const onPointerUp = () => {
    activeStroke.current = null;
  };

  const undo = () => setStrokes((prev) => prev.slice(0, -1));
  const clear = () => setStrokes([]);

  return (
    <div>
      <div className="toolbar">
        <button
          className={`radio-chip${tool === "brush" ? " active" : ""}`}
          onClick={() => setTool("brush")}
        >
          {t('ai.brush')}
        </button>
        <button
          className={`radio-chip${tool === "rect" ? " active" : ""}`}
          onClick={() => setTool("rect")}
        >
          {t('ai.rectangle')}
        </button>
        <button
          className={`radio-chip${tool === "erase" ? " active" : ""}`}
          onClick={() => setTool("erase")}
        >
          {t('ai.eraser')}
        </button>
        <span style={{ width: 14 }} />
        <label className="status-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {t('ai.size')}
          <input
            type="range"
            min={8}
            max={160}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: 110 }}
          />
        </label>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={undo} disabled={strokes.length === 0}>
          {t("common.undo")}
        </button>
        <button className="btn btn-sm" onClick={clear} disabled={strokes.length === 0}>
          {t("common.clear")}
        </button>
      </div>
      <p className="status-note" style={{ margin: "6px 0 10px" }}>
        {t('ai.maskTools')}
      </p>

      <div className="canvas-wrap">
        <img src={src} alt="source" />
        <canvas
          ref={canvasRef}
          width={naturalSize.width}
          height={naturalSize.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
});

export default MaskCanvas;
