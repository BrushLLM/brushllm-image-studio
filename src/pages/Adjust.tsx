import { usePersistedState } from "../lib/persistedState";
import { useMemo, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import BatchRunner from "../components/BatchRunner";
import BatchInput from "../components/BatchInput";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel from "../components/OutputPanel";
import { useOutputConfig } from "../lib/useOutputConfig";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { useTranslation } from "react-i18next";
import { blockedInputError, type RenderSettings } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { useBatchPreview } from "../lib/usePreview";


interface Slider {
  key: "brightness" | "contrast" | "saturation";
  labelKey: string;
}

const SLIDERS: Slider[] = [
  { key: "brightness", labelKey: "adjust.brightness" },
  { key: "contrast", labelKey: "adjust.contrast" },
  { key: "saturation", labelKey: "adjust.saturation" },
];

export default function Adjust() {
  const { t } = useTranslation();
  const { files, add, remove, clear, previewFile, selectPreview } = useImageFiles("adjust");
  const [inputError, setInputError] = usePersistedState<string | null>("local.adjust.inputError", null);
  const [brightness, setBrightness] = usePersistedState("local.adjust.brightness", 0);
  const [contrast, setContrast] = usePersistedState("local.adjust.contrast", 0);
  const [saturation, setSaturation] = usePersistedState("local.adjust.saturation", 0);
  const [format, setFormat] = usePersistedState<FormatChoice>("local.adjust.format", "same");
  const [quality, setQuality] = usePersistedState("local.adjust.quality", 92);
  const [preserveExif, setPreserveExif] = usePersistedState("local.adjust.preserveExif", false);
  const [output, setOutput] = useOutputConfig("adjust", "-adjusted");

  const dirty = brightness !== 0 || contrast !== 0 || saturation !== 0;
  const settings = useMemo<RenderSettings>(() => ({
    steps: dirty ? [{ kind: "adjust", brightness, contrast, saturation }] : [],
    format: format === "same" ? null : format,
    quality,
    preserve_exif: preserveExif,
  }), [dirty, brightness, contrast, saturation, format, quality, preserveExif]);
  const preview = useBatchPreview(previewFile, settings);

  const values = { brightness, contrast, saturation };
  const setters = { brightness: setBrightness, contrast: setContrast, saturation: setSaturation };

  return (
    <PageShell
      title={t("adjust.title")}
      subtitle={t("adjust.subtitle")}
    >
      {inputError && <div className="banner banner-error">{inputError}</div>}
      <div className="split">
        <BatchInput
          tool="adjust"
          files={files}
          onAdd={(paths) => { setInputError(null); add(paths); }}
          onRemove={remove}
          onClear={clear}
          previewFile={previewFile}
          onSelectPreview={selectPreview}
          label={t("adjust.dropLabel")}
          onBlockedInput={(files) => setInputError(blockedInputError(files))}
        >
          {previewFile && (
            <PreviewCard
              beforeUrl={convertFileSrc(previewFile)}
              onRefresh={format === "avif" ? preview.refresh : undefined}
              result={preview.result}
              loading={preview.loading}
              error={preview.error}
              note={files.length > 1 ? t("common.batchPreviewNote") : undefined}
            />
          )}
        </BatchInput>
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
            tool="adjust"
            files={files}
            runLabel={t("adjust.runButton", { count: files.length })}
            buildJob={(selected) => ({ files: selected, ...settings, output })}
          />
        </div>
      </div>
    </PageShell>
  );
}
