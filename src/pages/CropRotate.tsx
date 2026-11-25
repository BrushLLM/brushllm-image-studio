import { clearPersistedByPrefix, usePersistedState } from "../lib/persistedState";
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from "lucide-react";
import { useMemo, useRef } from "react";
import BatchRunner from "../components/BatchRunner";
import CropCanvas, { type CropCanvasHandle } from "../components/CropCanvas";
import DropZone from "../components/DropZone";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel from "../components/OutputPanel";
import { useOutputConfig } from "../lib/useOutputConfig";
import PageShell from "../components/PageShell";
import { previewCrop } from "../lib/ipc";
import {
  blockedInputError,
  CANVAS_FORMATS,
  unsupportedImageError,
  type Step,
} from "../lib/types";
import { usePreview } from "../lib/usePreview";
import { useTranslation } from "react-i18next";

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

export default function CropRotate() {
  const { t } = useTranslation();
  const [file, setFile] = usePersistedState<string | null>("local.crop.file", null);
  const [aspect, setAspect] = usePersistedState<number | null>("local.crop.aspect", null);
  const [rotation, setRotation] = usePersistedState("local.crop.rotation", 0); // 0 | 90 | 180 | 270
  const [flipH, setFlipH] = usePersistedState("local.crop.flipH", false);
  const [flipV, setFlipV] = usePersistedState("local.crop.flipV", false);
  const [format, setFormat] = usePersistedState<FormatChoice>("local.crop.format", "same");
  const [quality, setQuality] = usePersistedState("local.crop.quality", 92);
  const [preserveExif, setPreserveExif] = usePersistedState("local.crop.preserveExif", false);
  const [output, setOutput] = useOutputConfig("crop", "-crop");
  const cropRef = useRef<CropCanvasHandle>(null);
  const [loadError, setLoadError] = usePersistedState<string | null>("local.crop.loadError", null);

  const transform = useMemo<Step[]>(() => {
    const steps: Step[] = [];
    if (rotation === 90) steps.push({ kind: "rotate90" });
    if (rotation === 180) steps.push({ kind: "rotate180" });
    if (rotation === 270) steps.push({ kind: "rotate270" });
    if (flipH) steps.push({ kind: "flip_h" });
    if (flipV) steps.push({ kind: "flip_v" });
    return steps;
  }, [rotation, flipH, flipV]);
  const buildPreview = useMemo(
    () => file ? () => previewCrop(file, transform) : null,
    [file, transform],
  );
  const { result: preview, loading, error } = usePreview(buildPreview, false, 0);

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

  const buildSteps = (): Step[] => {
    const rect = cropRef.current?.getRect();
    return rect ? [...transform, { kind: "crop", ...rect }] : transform;
  };

  const rotateBy = (delta: number) =>
    setRotation((prev) => (((prev + delta) % 360) + 360) % 360);

  const previewSummary = [
    preview && `${preview.width} × ${preview.height} px`,
    rotation !== 0 && t("crop.rotation", { angle: rotation }),
    flipH && t("crop.flipH"),
    flipV && t("crop.flipV"),
  ].filter(Boolean).join(" · ");

  return (
    <PageShell
      title={t("crop.title")}
      subtitle={t("crop.subtitle")}
    >
      {(loadError || error) && <div className="banner banner-error" role="alert">{loadError || error}</div>}
      {!file && (
        <DropZone
          presentation="canvas"
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
          <div className="canvas-panel">
            <div className="toolbar">
              {ASPECTS.map((a) => (
                <button
                  key={a.label}
                  className={`radio-chip${aspect === a.value ? " active" : ""}`}
                  aria-pressed={aspect === a.value}
                  onClick={() => setAspect(a.value)}
                >
                  {a.value === null ? t("crop.free") : a.label}
                </button>
              ))}
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => rotateBy(-90)}
                aria-label={t("crop.rotateLeft")} title={t("crop.rotateLeft")}>
                <RotateCcw aria-hidden="true" /> 90°
              </button>
              <button className="btn btn-sm" onClick={() => rotateBy(90)}
                aria-label={t("crop.rotateRight")} title={t("crop.rotateRight")}>
                <RotateCw aria-hidden="true" /> 90°
              </button>
              <button
                className={`btn btn-sm${flipH ? " btn-primary" : ""}`}
                aria-pressed={flipH}
                onClick={() => setFlipH((v) => !v)}
              >
                <FlipHorizontal aria-hidden="true" /> {t("crop.flipH")}
              </button>
              <button
                className={`btn btn-sm${flipV ? " btn-primary" : ""}`}
                aria-pressed={flipV}
                onClick={() => setFlipV((v) => !v)}
              >
                <FlipVertical aria-hidden="true" /> {t("crop.flipV")}
              </button>
            </div>
            {preview && (
              <CropCanvas
                persistKey={`local.crop.rect.${file}:${rotation}:${flipH}:${flipV}:${aspect}`}
                ref={cropRef}
                src={preview.data_url}
                naturalSize={preview}
                aspect={aspect}
              />
            )}
            {loading && <p className="status-note" role="status">{t("errors.rendering")}</p>}
            {preview && <p className="status-note mt-2">{previewSummary}</p>}
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
                tool="crop"
                files={preview ? [file] : []}
                runLabel={t("common.saveImage")}
                buildJob={(files) => ({
                  files,
                  steps: buildSteps(),
                  format: format === "same" ? null : format,
                  quality,
                  preserve_exif: preserveExif,
                  output,
                })}
              />
            )}
            <button
              className="btn btn-block mt-3"
              onClick={() => setFile(null)}
            >
              {t("common.chooseDifferentImage")}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
