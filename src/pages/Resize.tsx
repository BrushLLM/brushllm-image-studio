import { usePersistedState } from "../lib/persistedState";
import { useMemo, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import BatchRunner from "../components/BatchRunner";
import BatchInput from "../components/BatchInput";
import OutputPanel from "../components/OutputPanel";
import { useOutputConfig } from "../lib/useOutputConfig";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { blockedInputError, type FitMode, type RenderSettings, type Step } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { useBatchPreview } from "../lib/usePreview";
import { useTranslation } from "react-i18next";

type Mode = "pixels" | "percent" | "preset";

const PRESETS: { label: string; width: number; height: number }[] = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "2K", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
  { label: "Full HD square", width: 1080, height: 1080 },
];

export default function Resize() {
  const { t } = useTranslation();
  const { files, add, remove, clear, previewFile, selectPreview } = useImageFiles("resize");
  const [inputError, setInputError] = usePersistedState<string | null>("local.resize.inputError", null);
  const [mode, setMode] = usePersistedState<Mode>("local.resize.mode", "percent");
  const [width, setWidth] = usePersistedState<string>("local.resize.width", "1920");
  const [height, setHeight] = usePersistedState<string>("local.resize.height", "1080");
  const [lockAspect, setLockAspect] = usePersistedState("local.resize.lockAspect", true);
  const [fitMode, setFitMode] = usePersistedState<FitMode>("local.resize.fitMode", "fit");
  const [noEnlarge, setNoEnlarge] = usePersistedState("local.resize.noEnlarge", true);
  const [percent, setPercent] = usePersistedState("local.resize.percent", 50);
  const [preset, setPreset] = usePersistedState("local.resize.preset", 0);
  const [output, setOutput] = useOutputConfig("resize", "");

  const steps = useMemo<Step[]>(() => {
    if (mode === "percent") {
      return [
        {
          kind: "resize",
          width: null,
          height: null,
          percent,
          mode: "fit",
          no_enlarge: false,
        },
      ];
    }
    if (mode === "preset") {
      const p = PRESETS[preset] ?? PRESETS[0];
      return [
        {
          kind: "resize",
          width: p.width,
          height: p.height,
          percent: null,
          mode: "fit",
          no_enlarge: true,
        },
      ];
    }
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    return [
      {
        kind: "resize",
        width: Number.isFinite(w) && w > 0 ? w : null,
        height: Number.isFinite(h) && h > 0 ? h : null,
        percent: null,
        mode: fitMode,
        no_enlarge: noEnlarge,
      },
    ];
  }, [mode, width, height, fitMode, noEnlarge, percent, preset]);
  const settings = useMemo<RenderSettings>(() => ({
    steps,
    format: null,
    quality: 92,
    preserve_exif: false,
  }), [steps]);
  const preview = useBatchPreview(previewFile, settings);

  return (
    <PageShell
      title={t("resize.title")}
      subtitle={t("resize.subtitle")}
    >
      {inputError && (
        <div className="banner banner-error">
          <span>{inputError}</span>
        </div>
      )}
      <div className="split">
        <BatchInput
          tool="resize"
          files={files}
          onAdd={(paths) => { setInputError(null); add(paths); }}
          onRemove={remove}
          onClear={clear}
          previewFile={previewFile}
          onSelectPreview={selectPreview}
          label={t("resize.dropLabel")}
          onBlockedInput={(files) => setInputError(blockedInputError(files))}
        >
          {previewFile && (
            <PreviewCard
              beforeUrl={convertFileSrc(previewFile)}
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
            <div className="field">
              <label>{t("resize.scaleBy")}</label>
              <div className="radio-row">
                {(["percent", "pixels", "preset"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    className={`radio-chip${mode === m ? " active" : ""}`}
                    onClick={() => setMode(m)}
                  >
                    {m === "percent" ? t("resize.percent") : m === "pixels" ? t("resize.pixels") : t("resize.preset")}
                  </button>
                ))}
              </div>
            </div>

            {mode === "percent" && (
              <div className="field">
                <div className="range-head">
                  <label className="mb-0">{t("resize.scale")}</label>
                  <span className="range-value">{percent}%</span>
                </div>
                <input
                  type="range"
                  className="range"
                  min={1}
                  max={400}
                  value={percent}
                  style={{ "--val": `${((percent - 1) / 399) * 100}%` } as CSSProperties}
                  onChange={(e) => setPercent(Number(e.target.value))}
                />
                <div className="preset-chips">
                  {[25, 50, 100, 200].map((value) => (
                    <button
                      key={value}
                      className={`chip${percent === value ? " active" : ""}`}
                      onClick={() => setPercent(value)}
                    >
                      {value}%
                    </button>
                  ))}
                </div>
                <div className="hint">{t("resize.aspectHint")}</div>
              </div>
            )}

            {mode === "pixels" && (
              <>
                <div className="field">
                  <div className="row">
                    <div>
                      <label>{t("resize.width")}</label>
                      <input
                        type="number"
                        min={1}
                        value={width}
                        onChange={(e) => {
                          setWidth(e.target.value);
                          if (lockAspect && height && width) {
                            const ratio = parseInt(height, 10) / parseInt(width, 10);
                            if (Number.isFinite(ratio) && ratio > 0) {
                              setHeight(
                                String(Math.max(1, Math.round(parseInt(e.target.value, 10) * ratio))),
                              );
                            }
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label>{t("resize.height")}</label>
                      <input
                        type="number"
                        min={1}
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <label className="check mt-2">
                    <input
                      type="checkbox"
                      checked={lockAspect}
                      onChange={(e) => setLockAspect(e.target.checked)}
                    />
                    {t("resize.lockAspect")}
                  </label>
                </div>
                <div className="field">
                  <label>{t("resize.whenDiffers")}</label>
                  <div className="radio-row">
                    {(
                      [
                        ["fit", t("resize.fit")],
                        ["fill", t("resize.fill")],
                        ["stretch", t("resize.stretch")],
                      ] as [FitMode, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={`radio-chip${fitMode === value ? " active" : ""}`}
                        onClick={() => setFitMode(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={noEnlarge}
                      onChange={(e) => setNoEnlarge(e.target.checked)}
                    />
                    {t("resize.noEnlarge")}
                  </label>
                </div>
              </>
            )}

            {mode === "preset" && (
              <div className="field">
                <label>{t("resize.targetSize")}</label>
                <div className="radio-row">
                  {PRESETS.map((p, index) => (
                    <button
                      key={p.label}
                      className={`radio-chip${preset === index ? " active" : ""}`}
                      onClick={() => setPreset(index)}
                    >
                      {p.label} · {p.width}×{p.height}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <OutputPanel value={output} onChange={setOutput} defaultSuffix="-resized" />
          </div>
          <BatchRunner
            tool="resize"
            files={files}
            runLabel={t("resize.runButton", { count: files.length })}
            buildJob={(selected) => ({ files: selected, ...settings, output })}
          />
        </div>
      </div>
    </PageShell>
  );
}
