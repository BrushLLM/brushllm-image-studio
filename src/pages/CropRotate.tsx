import { useCallback, useEffect, useRef, useState } from "react";
import BatchRunner from "../components/BatchRunner";
import CropCanvas, { type CropCanvasHandle } from "../components/CropCanvas";
import DropZone from "../components/DropZone";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import { loadDefaultOutputDir, readAssetDataUrl } from "../lib/ipc";
import {
  blockedInputError,
  CANVAS_FORMATS,
  unsupportedImageError,
  type OutFormat,
  type Step,
} from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("cannot load image"));
    image.src = url;
  });
}

export default function CropRotate({ onBack }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [aspect, setAspect] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [format, setFormat] = useState<FormatChoice>("same");
  const [quality, setQuality] = useState(92);
  const [preserveExif, setPreserveExif] = useState(false);
  const [output, setOutput] = useState<OutputConfig>({
    dir: null,
    suffix: "-crop",
    collision: "rename",
  });
  const cropRef = useRef<CropCanvasHandle>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    setFile(path);
    setLoadError(null);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  };

  /** Re-render the preview with the cumulative rotate/flip transform applied,
   *  so what you see (and crop) is exactly what gets saved. The image is read
   *  as a data: URL — asset-protocol images would taint the canvas. */
  const refreshPreview = useCallback(async () => {
    if (!file) return;
    try {
      const original = await loadImage(await readAssetDataUrl(file));
      const swap = rotation === 90 || rotation === 270;
      const width = swap ? original.naturalHeight : original.naturalWidth;
      const height = swap ? original.naturalWidth : original.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(width / 2, height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(original, -original.naturalWidth / 2, -original.naturalHeight / 2);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewSize({ width, height });
    } catch {
      setPreviewUrl(null);
    }
  }, [file, rotation, flipH, flipV]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const buildSteps = (): Step[] => {
    // Order matters: rotate/flip first, then crop in the (transformed) preview
    // coordinates — matching what the user sees.
    const steps: Step[] = [];
    if (rotation === 90) steps.push({ kind: "rotate90" });
    if (rotation === 180) steps.push({ kind: "rotate180" });
    if (rotation === 270) steps.push({ kind: "rotate270" });
    if (flipH) steps.push({ kind: "flip_h" });
    if (flipV) steps.push({ kind: "flip_v" });
    const rect = cropRef.current?.getRect();
    if (
      rect &&
      previewSize &&
      (rect.width < previewSize.width - 1 || rect.height < previewSize.height - 1)
    ) {
      steps.push({
        kind: "crop",
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
    return steps;
  };

  const rotateBy = (delta: number) =>
    setRotation((prev) => (((prev + delta) % 360) + 360) % 360);

  const transformed =
    rotation !== 0 || flipH || flipV
      ? ` · rotate ${rotation}°${flipH ? " · flip ⇋" : ""}${flipV ? " · flip ⇅" : ""}`
      : "";

  return (
    <PageShell
      title={t("crop.title")}
      subtitle={t("crop.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {loadError && <div className="banner banner-error">{loadError}</div>}
      {!file && (
        <DropZone
          onFiles={loadFile}
          label={t("crop.dropLabel")}
          multiple={false}
          accept={CANVAS_FORMATS}
          hint={t("common.canvasBrowseHint")}
          onUnsupported={(files) =>
            setLoadError(
              unsupportedImageError(files.length, "JPEG, PNG, WebP, GIF or BMP"),
            )
          }
          onBlockedInput={(files) => setLoadError(blockedInputError(files))}
        />
      )}

      {file && (
        <div className="split">
          <div>
            <div className="toolbar">
              {ASPECTS.map((a) => (
                <button
                  key={a.label}
                  className={`radio-chip${aspect === a.value ? " active" : ""}`}
                  onClick={() => setAspect(a.value)}
                >
                  {a.label}
                </button>
              ))}
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => rotateBy(-90)} title="Rotate left">
                ↺ 90°
              </button>
              <button className="btn btn-sm" onClick={() => rotateBy(90)} title="Rotate right">
                ↻ 90°
              </button>
              <button
                className={`btn btn-sm${flipH ? " btn-primary" : ""}`}
                onClick={() => setFlipH((v) => !v)}
              >
                {t("crop.flipH")}
              </button>
              <button
                className={`btn btn-sm${flipV ? " btn-primary" : ""}`}
                onClick={() => setFlipV((v) => !v)}
              >
                {t("crop.flipV")}
              </button>
            </div>
            {previewUrl && previewSize ? (
              <CropCanvas ref={cropRef} src={previewUrl} naturalSize={previewSize} aspect={aspect} />
            ) : (
              <p className="status-note">Rendering preview…</p>
            )}
            <p className="status-note" style={{ marginTop: 8 }}>
              {previewSize ? `${previewSize.width}×${previewSize.height}px` : ""}
              {transformed}
            </p>
          </div>
          <div className="side-col">
            <div className="card">
              <h2 className="card-title">{t("crop.output")}</h2>
              <FormatQuality
                format={format}
                onFormat={setFormat}
                quality={quality}
                onQuality={setQuality}
                preserveExif={preserveExif}
                onPreserveExif={setPreserveExif}
              />
              <OutputPanel value={output} onChange={setOutput} />
            </div>
            {file && (
              <BatchRunner
                files={[file]}
                runLabel={
                  transformed || buildSteps().some((s) => s.kind === "crop")
                    ? "Save edited image"
                    : "Save copy"
                }
                buildJob={(files) => ({
                  files,
                  steps: buildSteps(),
                  format: format === "same" ? null : (format as OutFormat),
                  quality,
                  preserve_exif: preserveExif,
                  output: {
                    dir: output.dir,
                    suffix: output.suffix,
                    collision: output.collision,
                  },
                })}
              />
            )}
            <button
              className="btn btn-block"
              style={{ marginTop: 12 }}
              onClick={() => {
                setFile(null);
                setPreviewUrl(null);
                setPreviewSize(null);
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
