import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpRight,
  Circle,
  Highlighter,
  Minus,
  Square,
  Type,
} from "lucide-react";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

type Tool = "rect" | "ellipse" | "line" | "arrow" | "highlight" | "text";

interface Point {
  x: number;
  y: number;
}

/** One finished annotation in natural image coordinates. */
interface Annotation {
  tool: Tool;
  from: Point;
  to: Point;
  size: number;
  color: string;
  text?: string;
}

const TOOLS: { id: Tool; label: string; icon: typeof Square }[] = [
  { id: "rect", label: "rect", icon: Square },
  { id: "ellipse", label: "ellipse", icon: Circle },
  { id: "line", label: "line", icon: Minus },
  { id: "arrow", label: "arrow", icon: ArrowUpRight },
  { id: "highlight", label: "highlight", icon: Highlighter },
  { id: "text", label: "text", icon: Type },
];

const PALETTE = [
  "#dc2626",
  "#facc15",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f97316",
  "#000000",
  "#ffffff",
];

const SIZES = [
  { label: "Thin", value: 4 },
  { label: "Medium", value: 8 },
  { label: "Thick", value: 16 },
];

/** Draw one annotation onto a context in natural coordinates. */
function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation) {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const { from, to } = a;

  if (a.tool === "highlight") {
    ctx.globalAlpha = 0.35;
    ctx.fillRect(from.x, from.y - a.size, to.x - from.x, a.size * 2);
  } else if (a.tool === "rect") {
    ctx.strokeRect(
      Math.min(from.x, to.x),
      Math.min(from.y, to.y),
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
    );
  } else if (a.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      Math.abs(to.x - from.x) / 2,
      Math.abs(to.y - from.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else if (a.tool === "line" || a.tool === "arrow") {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    if (a.tool === "arrow") {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = Math.max(a.size * 3.5, 14);
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(
        to.x - head * Math.cos(angle - Math.PI / 7),
        to.y - head * Math.sin(angle - Math.PI / 7),
      );
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(
        to.x - head * Math.cos(angle + Math.PI / 7),
        to.y - head * Math.sin(angle + Math.PI / 7),
      );
      ctx.stroke();
    }
  } else if (a.tool === "text" && a.text) {
    ctx.font = `700 ${a.size * 7}px ${FONT_STACK}`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, a.size / 3);
    ctx.strokeStyle = outlineColor(a.color);
    ctx.strokeText(a.text, a.to.x, a.to.y);
    ctx.fillText(a.text, a.to.x, a.to.y);
  }
  ctx.restore();
}

const FONT_STACK =
  'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/** Dark outline behind light text (and vice versa) for readability. */
function outlineColor(color: string): string {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1c1917" : "#ffffff";
}

export default function ImageAnnotate({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState(PALETTE[0]);
  const [strokeSize, setStrokeSize] = useState(8);
  const [textDraft, setTextDraft] = useState("Note");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<Annotation | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    setAnnotations([]);
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

  const redraw = (extra?: Annotation | null) => {
    const canvas = canvasRef.current;
    const image = imgElRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const a of annotations) drawAnnotation(ctx, a);
    if (extra) drawAnnotation(ctx, extra);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !naturalSize) return;
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, dataUrl, naturalSize]);

  const toNatural = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, ((event.clientX - rect.left) / rect.width) * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, ((event.clientY - rect.top) / rect.height) * canvas.height)),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "text") {
      if (!textDraft.trim()) return;
      const p = toNatural(event);
      setAnnotations((prev) => [
        ...prev,
        { tool, from: p, to: p, size: strokeSize, color, text: textDraft.trim() },
      ]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = { tool, from: toNatural(event), to: toNatural(event), size: strokeSize, color };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active) return;
    active.to = toNatural(event);
    redraw(active);
  };

  const onPointerUp = () => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    setAnnotations((prev) => [...prev, active]);
  };

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // With a default output folder configured, save straight into it —
    // no dialog. Otherwise fall back to the save dialog.
    const dir = await loadDefaultOutputDir();
    if (!dir) return;
    const path = `${dir.replace(/\/+$/, "")}/annotated-${Date.now()}.png`;
    setBusy(true);
    try {
      const out = canvas.toDataURL("image/png");
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
      title={t("annotate.title")}
      subtitle={t("annotate.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("annotate.dropLabel")}
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
              {TOOLS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`radio-chip${tool === id ? " active" : ""}`}
                  onClick={() => setTool(id)}
                  title={label}
                >
                  <Icon /> {t(`annotate.${label}`)}
                </button>
              ))}
            </div>
            <div className="canvas-wrap" style={{ cursor: "crosshair" }}>
              {/* Base image kept under the canvas for sharp rendering. */}
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
              {tool === "text"
                ? t("annotate.textHint", { text: textDraft })
                : t("annotate.dragHint")}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">Settings</h2>
              <div className="field">
                <label>{t("annotate.color")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      title={c}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border:
                          color === c
                            ? "2.5px solid var(--violet)"
                            : "1px solid var(--border-strong)",
                        background: c,
                        cursor: "pointer",
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: 38, height: 30, padding: 2 }}
                    title={t("annotate.customColor")}
                  />
                </div>
              </div>
              <div className="field">
                <label>{t("annotate.stroke")}</label>
                <div className="radio-row">
                  {SIZES.map((s) => (
                    <button
                      key={s.value}
                      className={`radio-chip${strokeSize === s.value ? " active" : ""}`}
                      onClick={() => setStrokeSize(s.value)}
                    >
                      {t(`annotate.${s.label.toLowerCase()}`)}
                    </button>
                  ))}
                </div>
              </div>
              {tool === "text" && (
                <div className="field">
                  <label>{t("annotate.textToPlace")}</label>
                  <input
                    type="text"
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    placeholder={t("annotate.textPlaceholder")}
                    style={{ userSelect: "text" }}
                  />
                </div>
              )}
              <div className="row">
                <button
                  className="btn"
                  onClick={() => setAnnotations((prev) => prev.slice(0, -1))}
                  disabled={annotations.length === 0}
                >
                  Undo
                </button>
                <button
                  className="btn"
                  onClick={() => setAnnotations([])}
                  disabled={annotations.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="card">
              <button
                className="btn btn-primary btn-block"
                onClick={exportImage}
                disabled={busy || annotations.length === 0}
              >
                {busy ? <><span className="spinner" /> {t("common.saving")}</> : t("annotate.savePng")}
              </button>
              {savedTo && !busy && (
                <div className="banner banner-ok" style={{ marginTop: 12, wordBreak: "break-all" }}>
                  {savedTo}
                </div>
              )}
            </div>
            <button
              className="btn btn-block btn-lemon"
              onClick={() => {
                setFile(null);
                setDataUrl(null);
                setNaturalSize(null);
                setAnnotations([]);
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
