import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import DropZone from "../components/DropZone";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import { applyOverlay, loadDefaultOutputDir, readAssetDataUrl } from "../lib/ipc";
import { blockedInputError, CANVAS_FORMATS, unsupportedImageError, type OutFormat } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

type WatermarkType = "text" | "image";
type Mode = "position" | "tiled";

const FONT_STACK = `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans", sans-serif`;

export default function Watermark({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [type, setType] = useState<WatermarkType>("text");
  const [text, setText] = useState("© BrushLLM");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSizePct, setTextSizePct] = useState(6);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoSizePct, setLogoSizePct] = useState(25);
  const [opacity, setOpacity] = useState(35);
  const [rotation, setRotation] = useState(-30);
  const [mode, setMode] = useState<Mode>("tiled");
  const [position, setPosition] = useState(8); // 3×3 grid, 8 = bottom-right
  const [gapPct, setGapPct] = useState(120);
  const [format, setFormat] = useState<FormatChoice>("same");
  const [quality, setQuality] = useState(90);
  const [preserveExif, setPreserveExif] = useState(false);
  const [output, setOutput] = useState<OutputConfig>({
    dir: null,
    suffix: "-watermarked",
    collision: "rename",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setResultPath(null);
    setError(null);
    // Data URL (not asset protocol) so canvas exports stay untainted.
    readAssetDataUrl(path).then((url) => {
      const image = new Image();
      image.onload = () => setBaseImage(image);
      image.src = url;
    });
  };

  const pickLogo = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: CANVAS_FORMATS }],
    });
    if (typeof path !== "string") return;
    setLogoPath(path);
    readAssetDataUrl(path).then((url) => {
      const image = new Image();
      image.onload = () => setLogoImage(image);
      image.src = url;
    });
  };

  /** Draw the watermark layer (only) into a context at natural resolution. */
  const drawWatermark = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (type === "text" && !text.trim()) return;
      if (type === "image" && !logoImage) return;

      const unitWidth =
        type === "text" ? (width * textSizePct) / 100 : (width * logoSizePct) / 100;

      ctx.save();
      ctx.globalAlpha = opacity / 100;
      ctx.translate(width / 2, height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      // Work in a coordinate system centered on the image for easy tiling.
      ctx.translate(-width / 2, -height / 2);

      let markW: number;
      let markH: number;
      if (type === "text") {
        ctx.font = `600 ${unitWidth}px ${FONT_STACK}`;
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        markW = ctx.measureText(text).width;
        markH = unitWidth * 1.15;
      } else {
        const aspect = logoImage!.naturalWidth / logoImage!.naturalHeight;
        markW = unitWidth;
        markH = unitWidth / aspect;
      }

      const drawOne = (cx: number, cy: number) => {
        if (type === "text") {
          ctx.fillText(text, cx, cy);
        } else {
          ctx.drawImage(logoImage!, cx - markW / 2, cy - markH / 2, markW, markH);
        }
      };

      if (mode === "position") {
        const marginX = width * 0.03;
        const marginY = height * 0.03;
        const col = position % 3;
        const row = Math.floor(position / 3);
        const cx =
          col === 0
            ? marginX + markW / 2
            : col === 1
              ? width / 2
              : width - marginX - markW / 2;
        const cy =
          row === 0
            ? marginY + markH / 2
            : row === 1
              ? height / 2
              : height - marginY - markH / 2;
        drawOne(Math.min(Math.max(cx, markW / 2), width - markW / 2), Math.min(Math.max(cy, markH / 2), height - markH / 2));
      } else {
        const gap = (markW * gapPct) / 100;
        const stepX = markW + gap;
        const stepY = markH + gap;
        for (let y = (height % stepY) / 2 - stepY; y < height + stepY; y += stepY) {
          for (let x = (width % stepX) / 2 - stepX; x < width + stepX; x += stepX) {
            drawOne(x, y);
          }
        }
      }
      ctx.restore();
    },
    [type, text, logoImage, textSizePct, logoSizePct, opacity, rotation, mode, position, gapPct, textColor],
  );

  // Live preview: base image + watermark, redrawn on every control change.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !baseImage) return;
    canvas.width = baseImage.naturalWidth;
    canvas.height = baseImage.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);
    drawWatermark(ctx, canvas.width, canvas.height);
  }, [baseImage, drawWatermark]);

  const run = async () => {
    if (!file || !baseImage || busy) return;
    setBusy(true);
    setError(null);
    setResultPath(null);
    try {
      // Export the watermark layer only (transparent PNG at natural size);
      // Rust composites it onto the untouched original to avoid quality loss.
      const overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = baseImage.naturalWidth;
      overlayCanvas.height = baseImage.naturalHeight;
      const ctx = overlayCanvas.getContext("2d")!;
      drawWatermark(ctx, overlayCanvas.width, overlayCanvas.height);

      const blob: Blob | null = await new Promise((resolve) =>
        overlayCanvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("cannot export watermark layer");
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });

      const path = await applyOverlay({
        image_path: file,
        overlay_b64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        format: (format === "same" ? null : format) as OutFormat | null,
        quality,
        preserve_exif: preserveExif,
        output: { dir: output.dir, suffix: output.suffix, collision: output.collision },
      });
      setResultPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasWatermark =
    (type === "text" && text.trim().length > 0) || (type === "image" && logoImage !== null);

  return (
    <PageShell
      title={t("watermark.title")}
      subtitle={t("watermark.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {!file && error && (
        <div className="banner banner-error">{error}</div>
      )}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("watermark.dropLabel")}
          multiple={false}
          accept={CANVAS_FORMATS}
          hint={t("common.canvasBrowseHint")}
          onUnsupported={(files) =>
            setError(unsupportedImageError(files.length, "JPEG, PNG, WebP, GIF or BMP"))
          }
          onBlockedInput={(files) => setError(blockedInputError(files))}
        />
      )}

      {file && (
        <div className="split">
          <div>
            <div className="preview-frame">
              <canvas ref={previewRef} />
            </div>
            <p className="status-note" style={{ marginTop: 8 }}>
              {baseImage ? `${baseImage.naturalWidth}×${baseImage.naturalHeight}px` : "loading…"}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("watermark.title")}</h2>
              <div className="field">
                <label>{t("watermark.type")}</label>
                <div className="radio-row">
                  <button
                    className={`radio-chip${type === "text" ? " active" : ""}`}
                    onClick={() => setType("text")}
                  >
                    {t("watermark.text")}
                  </button>
                  <button
                    className={`radio-chip${type === "image" ? " active" : ""}`}
                    onClick={() => setType("image")}
                  >
                    {t("watermark.image")}
                  </button>
                </div>
              </div>

              {type === "text" && (
                <>
                  <div className="field">
                    <label>{t("watermark.textLabel")}</label>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={t("watermark.textPlaceholder")}
                    />
                  </div>
                  <div className="field row">
                    <div>
                      <label>{t("watermark.color")}</label>
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        style={{ width: 60, height: 34, padding: 2 }}
                      />
                    </div>
                    <div>
                      <label>{t("watermark.sizeOfWidth", { pct: textSizePct })}</label>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={textSizePct}
                        onChange={(e) => setTextSizePct(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </>
              )}

              {type === "image" && (
                <div className="field">
                  <label>{t("watermark.pickLogoHint")}</label>
                  <div className="row">
                    <button className="btn" onClick={pickLogo}>
                      {logoPath
                        ? logoPath.replace(/\\/g, "/").split("/").pop()
                        : t("watermark.chooseImage")}
                    </button>
                  </div>
                  {logoImage && (
                    <div className="field" style={{ marginTop: 10 }}>
                      <label>{t("watermark.sizeOfWidth", { pct: logoSizePct })}</label>
                      <input
                        type="range"
                        min={5}
                        max={60}
                        value={logoSizePct}
                        onChange={(e) => setLogoSizePct(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="field row">
                <div>
                  <label>{t("watermark.opacity")} — {opacity}%</label>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>{t("watermark.rotation")} — {rotation}°</label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="field">
                <label>{t("watermark.placement")}</label>
                <div className="radio-row">
                  <button
                    className={`radio-chip${mode === "tiled" ? " active" : ""}`}
                    onClick={() => setMode("tiled")}
                  >
                    {t("watermark.tiled")}
                  </button>
                  <button
                    className={`radio-chip${mode === "position" ? " active" : ""}`}
                    onClick={() => setMode("position")}
                  >
                    {t("watermark.singlePosition")}
                  </button>
                </div>
              </div>

              {mode === "tiled" ? (
                <div className="field">
                  <label>Tile gap — {gapPct}%</label>
                  <input
                    type="range"
                    min={20}
                    max={400}
                    value={gapPct}
                    onChange={(e) => setGapPct(Number(e.target.value))}
                  />
                </div>
              ) : (
                <div className="field">
                  <label>{t("watermark.position")}</label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 34px)",
                      gap: 4,
                    }}
                  >
                    {Array.from({ length: 9 }, (_, index) => (
                      <button
                        key={index}
                        className={`radio-chip${position === index ? " active" : ""}`}
                        style={{ width: 34, height: 30, padding: 0 }}
                        onClick={() => setPosition(index)}
                        title={`Position ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="card-title">Output</h2>
              <FormatQuality
                format={format}
                onFormat={setFormat}
                quality={quality}
                onQuality={setQuality}
                preserveExif={preserveExif}
                onPreserveExif={setPreserveExif}
              />
              <OutputPanel value={output} onChange={setOutput} defaultSuffix="-watermarked" />
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 10 }}
                onClick={run}
                disabled={!hasWatermark || busy}
              >
                {busy ? (
                  <>
                    <span className="spinner" /> {t("watermark.applying")}
                  </>
                ) : (
                  t("watermark.apply")
                )}
              </button>
              {error && (
                <div className="banner banner-error" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}
              {resultPath && (
                <div
                  className="banner banner-warn"
                  style={{ marginTop: 12, background: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" }}
                >
                  <span>✓ Saved to {resultPath}</span>
                  <span className="banner-link" onClick={() => revealItemInDir(resultPath)}>
                    Show in folder
                  </span>
                </div>
              )}
            </div>

            <button
              className="btn btn-block"
              style={{ marginTop: 4 }}
              onClick={() => {
                setFile(null);
                setBaseImage(null);
                setResultPath(null);
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
