import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { readAssetDataUrl } from "../lib/ipc";
import { CANVAS_FORMATS, unsupportedImageError } from "../lib/types";
import { useTranslation } from "react-i18next";

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

function toRgbString(c: Rgb): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/** Readable text color for a swatch background. */
function contrastText({ r, g, b }: Rgb): string {
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1c1917" : "#ffffff";
}

export default function ColorPicker({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<Rgb | null>(null);
  const [picked, setPicked] = useState<Rgb | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [swatches, setSwatches] = useState<Rgb[]>([]);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setError(null);
    setHover(null);
    setPicked(null);
    setSwatches([]);
    readAssetDataUrl(path)
      .then((url) => {
        const image = new Image();
        image.onload = () => {
          imgRef.current = image;
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext("2d")?.drawImage(image, 0, 0);
          offscreenRef.current = canvas;
          setDataUrl(url);
        };
        image.onerror = () => {
          setError(t("errors.cannotPreview"));
          setFile(null);
        };
        image.src = url;
      })
      .catch((e) => {
        setError(String(e));
        setFile(null);
      });
  };

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
      setError("cannot access the clipboard");
    }
  };

  const current = hover ?? picked;

  return (
    <PageShell
      title={t("picker.title")}
      subtitle={t("picker.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && <div className="banner banner-error">{error}</div>}
      {!file && (
        <DropZone
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

      {file && dataUrl && (
        <div className="split">
          <div>
            <div className="picker-view" style={{ cursor: "crosshair" }}>
              <img
                src={dataUrl}
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
            <p className="status-note" style={{ marginTop: 8 }}>
              {t("picker.hoverHint")}
            </p>
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
              {current && (
                <>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => copy(toHex(current))}>
                      {copied === toHex(current) ? <Check /> : <Copy />} HEX
                    </button>
                    <button className="btn btn-sm" onClick={() => copy(toRgbString(current))}>
                      {copied === toRgbString(current) ? <Check /> : <Copy />} RGB
                    </button>
                  </div>
                  <div className="hint" style={{ marginTop: 8 }}>
                    {toHex(current).toUpperCase()} · {toRgbString(current)}
                  </div>
                </>
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
            <button
              className="btn btn-block btn-lemon"
              onClick={() => {
                setFile(null);
                setDataUrl(null);
                setSwatches([]);
                setPicked(null);
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
