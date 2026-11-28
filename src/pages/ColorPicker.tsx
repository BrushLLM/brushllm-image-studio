import { usePersistedState } from "../lib/persistedState";
import { useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { useCanvasSource } from "../lib/useCanvasSource";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";


interface Rgb {
  r: number;
  g: number;
  b: number;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function toRgbString(c: Rgb): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/** Readable text color for a swatch background. */
function contrastText({ r, g, b }: Rgb): string {
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1c1917" : "#ffffff";
}

export default function ColorPicker() {
  const { t } = useTranslation();
  const source = useCanvasSource("picker");
  const image = source.image;
  const [error, setError] = usePersistedState<string | null>("local.picker.error", null);
  const [hover, setHover] = usePersistedState<Rgb | null>("local.picker.hover", null);
  const [picked, setPicked] = usePersistedState<Rgb | null>("local.picker.picked", null);
  const [copied, setCopied] = usePersistedState<string | null>("local.picker.copied", null);
  const [swatches, setSwatches] = usePersistedState<Rgb[]>("local.picker.swatches", []);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setError(null);
    setHover(null);
    setPicked(null);
    setSwatches([]);
    void source.load(path);
  };

  useEffect(() => {
    offscreenRef.current = null;
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0);
    offscreenRef.current = canvas;
  }, [image]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const pixelAt = (event: React.MouseEvent<HTMLImageElement>): Rgb | null => {
    const img = event.currentTarget;
    const canvas = offscreenRef.current;
    if (!canvas) return null;
    const rect = img.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const [r, g, b] = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
    return { r, g, b };
  };

  const copy = async (text: string) => {
    try {
      // Native clipboard via the Tauri plugin — navigator.clipboard is
      // unreliable inside the WebView (silent failures leave stale data).
      await writeText(text);
      setCopied(text);
    } catch {
      setError(t("errors.clipboard"));
    }
  };

  const current = hover ?? picked;

  return (
    <PageShell
      title={t("picker.title")}
      subtitle={t("picker.subtitle")}
    >
      {(error || source.error) && <div className="banner banner-error" role="alert">{error || source.error}</div>}
      <div className="split">
        <div className="workbench-main">
          {source.loading && <p className="status-note" role="status">{t("errors.rendering")}</p>}
          {!image && !source.loading && (
            <DropZone
              presentation="canvas"
              onFiles={loadFile}
              label={t("picker.dropLabel")}
              multiple={false}
              accept={CANVAS_FORMATS}
              hint={t("common.canvasBrowseHint")}
              onUnsupported={(files) =>
                setError(unsupportedImageError(files.length, "JPEG, PNG, WebP, GIF or BMP"))
              }
            />
          )}
          {image && (
            <div className="canvas-panel">
              <div className="picker-view cursor-cross">
                <img
                  src={image.src}
                  alt="source"
                  draggable={false}
                  onMouseMove={(e) => setHover(pixelAt(e))}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    const px = pixelAt(e);
                    if (!px) return;
                    setPicked(px);
                    setSwatches((prev) =>
                      prev.some((s) => toHex(s) === toHex(px)) ? prev : [px, ...prev].slice(0, 12),
                    );
                  }}
                />
              </div>
              <p className="status-note mt-2">
                {t("picker.hoverHint")}
              </p>
            </div>
          )}
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("picker.color")}</h2>
            <div
              style={{
                height: 86,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: current ? toHex(current) : "var(--bg-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: current ? contrastText(current) : "var(--muted)",
                fontWeight: 700,
                fontSize: 15,
                marginBottom: 12,
              }}
            >
              {current ? toHex(current).toUpperCase() : t("picker.hoverImage")}
            </div>
            <div className="row">
              <button className="btn btn-sm" disabled={!current} onClick={() => current && copy(toHex(current))}>
                {current && copied === toHex(current) ? <Check /> : <Copy />} HEX
              </button>
              <button className="btn btn-sm" disabled={!current} onClick={() => current && copy(toRgbString(current))}>
                {current && copied === toRgbString(current) ? <Check /> : <Copy />} RGB
              </button>
            </div>
            {current && (
              <div className="hint mt-2">
                {toHex(current).toUpperCase()} · {toRgbString(current)}
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">{t("picker.samples", { count: swatches.length })}</h2>
            {swatches.length === 0 ? (
              <div className="hint">{t("picker.samplesHint")}</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {swatches.map((s, i) => (
                  <button
                    key={`${toHex(s)}-${i}`}
                    title={`${toHex(s).toUpperCase()} · click to copy`}
                    onClick={() => copy(toHex(s))}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: toHex(s),
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {image && (
            <button
              className="btn btn-block"
              onClick={() => {
                source.clear();
                setError(null);
                setSwatches([]);
                setPicked(null);
                setHover(null);
                setCopied(null);
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
