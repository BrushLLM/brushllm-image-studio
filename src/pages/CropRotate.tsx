import { clearPersistedByPrefix, usePersistedState } from "../lib/persistedState";
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
  const [file, setFile] = usePersistedState<string | null>("local.crop.file", null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [renderedTransform, setRenderedTransform] = useState<string | null>(null);
  const [aspect, setAspect] = usePersistedState<number | null>("local.crop.aspect", null);
  const [rotation, setRotation] = usePersistedState("local.crop.rotation", 0); // 0 | 90 | 180 | 270
  const [flipH, setFlipH] = usePersistedState("local.crop.flipH", false);
  const [flipV, setFlipV] = usePersistedState("local.crop.flipV", false);
  const [format, setFormat] = usePersistedState<FormatChoice>("local.crop.format", "same");
  const [quality, setQuality] = usePersistedState("local.crop.quality", 92);
  const [preserveExif, setPreserveExif] = usePersistedState("local.crop.preserveExif", false);
  const [output, setOutput] = usePersistedState<OutputConfig>("local.crop.output", {
    dir: null,
    suffix: "-crop",
    collision: "rename",
  });
  const cropRef = useRef<CropCanvasHandle>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewRequest = useRef(0);
  const [loadError, setLoadError] = usePersistedState<string | null>("local.crop.loadError", null);

  useEffect(() => {
    if (output.dir) return;
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const transformKey = `${file}:${rotation}:${flipH}:${flipV}`;
  const previewReady = renderedTransform === transformKey;

  const loadFile = (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    clearPersistedByPrefix("local.crop.rect.");
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
    const request = ++previewRequest.current;
    if (!file) return;
    try {
      const original = await loadImage(await readAssetDataUrl(file));
      if (request !== previewRequest.current) return;
      const swap = rotation === 90 || rotation === 270;
      const width = swap ? original.naturalHeight : original.naturalWidth;
      const height = swap ? original.naturalWidth : original.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(width / 2, height / 2);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(original, -original.naturalWidth / 2, -original.naturalHeight / 2);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob || request !== previewRequest.current) return;
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewSize({ width, height });
      setRenderedTransform(`${file}:${rotation}:${flipH}:${flipV}`);
    } catch (e) {
      if (request !== previewRequest.current) return;
      setLoadError(String(e));
      setPreviewUrl(null);
    }
  }, [file, rotation, flipH, flipV]);

  useEffect(() => {
    refreshPreview();
    return () => { previewRequest.current++; };
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
                  {a.value === null ? t("crop.free") : a.label}
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
            {previewReady && previewUrl && previewSize ? (
              <CropCanvas persistKey={`local.crop.rect.${file}:${rotation}:${flipH}:${flipV}:${aspect}`} ref={cropRef} src={previewUrl} naturalSize={previewSize} aspect={aspect} />
            ) : (
              <p className="status-note">{t("errors.rendering")}</p>
            )}
            <p className="status-note mt-2">
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
                files={previewReady ? [file] : []}
                runLabel={t("common.saveImage")}
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
              className="btn btn-block mt-3"
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
