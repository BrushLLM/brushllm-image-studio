import { useEffect, useState, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import BatchRunner from "../components/BatchRunner";
import DropZone from "../components/DropZone";
import FileQueue from "../components/FileQueue";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { loadDefaultOutputDir, previewBatch } from "../lib/ipc";
import { blockedInputError, type FitMode, type Step } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { usePreview } from "../lib/usePreview";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

type Mode = "pixels" | "percent" | "preset";

const PRESETS: { label: string; width: number; height: number }[] = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "2K", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
  { label: "Full HD square", width: 1080, height: 1080 },
];

export default function Resize({ onBack }: Props) {
  const { t } = useTranslation();
  const { files, add, remove, clear } = useImageFiles();
  const [inputError, setInputError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("percent");
  const [width, setWidth] = useState<string>("1920");
  const [height, setHeight] = useState<string>("1080");
  const [lockAspect, setLockAspect] = useState(true);
  const [fitMode, setFitMode] = useState<FitMode>("fit");
  const [noEnlarge, setNoEnlarge] = useState(true);
  const [percent, setPercent] = useState(50);
  const [preset, setPreset] = useState(0);
  const [output, setOutput] = useState<OutputConfig>({
    dir: null,
    suffix: "",
    collision: "rename",
  });

  useEffect(() => {
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const buildSteps = (): Step[] => {
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
  };

  const firstFile = files[0] ?? null;
  const stepsJson = JSON.stringify(buildSteps());
  const preview = usePreview(
    () =>
      firstFile
        ? previewBatch({
            file: firstFile,
            steps: JSON.parse(stepsJson) as Step[],
            format: null,
            quality: 92,
          })
        : null,
    [firstFile, stepsJson],
  );

  return (
    <PageShell
      title={t("resize.title")}
      subtitle={t("resize.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      {inputError && (
        <div className="banner banner-error">
          <span>{inputError}</span>
        </div>
      )}
      <div className="split">
        <div>
          <FileQueue files={files} onRemove={remove} onClear={clear} />
          <DropZone
            onFiles={add}
            label={t("resize.dropLabel")}
            hero={files.length === 0}
            onBlockedInput={(files) => setInputError(blockedInputError(files))}
          />
          {firstFile && (
            <div style={{ marginTop: 16 }}>
              <PreviewCard
                beforeUrl={convertFileSrc(firstFile)}
                result={preview.result}
                loading={preview.loading}
                error={preview.error}
                afterTitle="Resized"
                note={files.length > 1 ? t("resize.firstOfMany", { count: files.length }) : undefined}
              />
            </div>
          )}
        </div>
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
                  <label style={{ marginBottom: 0 }}>{t("resize.scale")}</label>
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
                  <label className="check" style={{ marginTop: 8 }}>
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
            files={files}
            runLabel={t("resize.runButton", { count: files.length })}
            buildJob={(selected) => ({
              files: selected,
              steps: buildSteps(),
              format: null,
              quality: 92,
              preserve_exif: false,
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
