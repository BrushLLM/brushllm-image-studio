import { usePersistedState } from "../lib/persistedState";
import { useEffect, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import BatchRunner from "../components/BatchRunner";
import DropZone from "../components/DropZone";
import FileQueue from "../components/FileQueue";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir, previewBatch } from "../lib/ipc";
import { blockedInputError, type OutFormat, type Step } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { usePreview } from "../lib/usePreview";

interface Props {
  onBack: () => void;
}

interface Slider {
  key: "brightness" | "contrast" | "saturation";
  labelKey: string;
}

const SLIDERS: Slider[] = [
  { key: "brightness", labelKey: "adjust.brightness" },
  { key: "contrast", labelKey: "adjust.contrast" },
  { key: "saturation", labelKey: "adjust.saturation" },
];

export default function Adjust({ onBack }: Props) {
  const { t } = useTranslation();
  const { files, add, remove, clear } = useImageFiles("adjust");
  const [inputError, setInputError] = usePersistedState<string | null>("local.adjust.inputError", null);
  const [brightness, setBrightness] = usePersistedState("local.adjust.brightness", 0);
  const [contrast, setContrast] = usePersistedState("local.adjust.contrast", 0);
  const [saturation, setSaturation] = usePersistedState("local.adjust.saturation", 0);
  const [format, setFormat] = usePersistedState<FormatChoice>("local.adjust.format", "same");
  const [quality, setQuality] = usePersistedState("local.adjust.quality", 92);
  const [preserveExif, setPreserveExif] = usePersistedState("local.adjust.preserveExif", false);
  const [output, setOutput] = usePersistedState<OutputConfig>("local.adjust.output", {
    dir: null,
    suffix: "-adjusted",
    collision: "rename",
  });

  useEffect(() => {
    if (output.dir) return;
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const buildSteps = (): Step[] => {
    if (brightness === 0 && contrast === 0 && saturation === 0) return [];
    return [{ kind: "adjust", brightness, contrast, saturation }];
  };

  const firstFile = files[0] ?? null;
  const stepsJson = JSON.stringify(buildSteps());
  const preview = usePreview(
    () =>
      firstFile
        ? previewBatch({
            preserveExif: preserveExif,
            file: firstFile,
            steps: JSON.parse(stepsJson) as Step[],
            format: format === "same" ? null : (format as OutFormat),
            quality,
          })
        : null,
    [firstFile, stepsJson, format, quality, preserveExif],
    format === "avif",
  );

  const values = { brightness, contrast, saturation };
  const setters = { brightness: setBrightness, contrast: setContrast, saturation: setSaturation };
  const dirty = brightness !== 0 || contrast !== 0 || saturation !== 0;

  return (
    <PageShell
      title={t("adjust.title")}
      subtitle={t("adjust.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {inputError && <div className="banner banner-error">{inputError}</div>}
      <div className="split">
        <div>
          <FileQueue files={files} onRemove={remove} onClear={clear} />
          <DropZone
            onFiles={(paths) => { setInputError(null); add(paths); }}
            label={t("adjust.dropLabel")}
            hero={files.length === 0}
            onBlockedInput={(files) => setInputError(blockedInputError(files))}
          />
          {firstFile && (
            <div className="mt-4">
              <PreviewCard
                beforeUrl={convertFileSrc(firstFile)}
                onRefresh={format === "avif" ? preview.refresh : undefined}
                result={preview.result}
                loading={preview.loading}
                error={preview.error}
                note={files.length > 1 ? t("adjust.firstOfMany", { count: files.length }) : undefined}
              />
            </div>
          )}
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("common.settingsCard")}</h2>
            {SLIDERS.map(({ key, labelKey }) => (
              <div className="field" key={key}>
                <div className="range-head">
                  <label className="mb-0">{t(labelKey)}</label>
                  <span className="range-value">{values[key] > 0 ? `+${values[key]}` : values[key]}</span>
                </div>
                <input
                  type="range"
                  className="range"
                  min={-100}
                  max={100}
                  value={values[key]}
                  style={{ "--val": `${((values[key] + 100) / 200) * 100}%` } as CSSProperties}
                  onChange={(e) => setters[key](Number(e.target.value))}
                />
              </div>
            ))}
            <div className="preset-chips mb-3">
              <button
                className="chip"
                onClick={() => {
                  setBrightness(0);
                  setContrast(0);
                  setSaturation(0);
                }}
                disabled={!dirty}
              >
                {t("adjust.resetAll")}
              </button>
            </div>
            <FormatQuality
              format={format}
              onFormat={setFormat}
              quality={quality}
              onQuality={setQuality}
              preserveExif={preserveExif}
              onPreserveExif={setPreserveExif}
            />
            <OutputPanel value={output} onChange={setOutput} defaultSuffix="-adjusted" />
          </div>
          <BatchRunner
            files={files}
            runLabel={t("adjust.runButton", { count: files.length })}
            buildJob={(selected) => ({
              files: selected,
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
        </div>
      </div>
    </PageShell>
  );
}
