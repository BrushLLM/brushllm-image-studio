import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Columns2, Rows2 } from "lucide-react";
import BatchRunner from "../components/BatchRunner";
import DropZone from "../components/DropZone";
import FileQueue from "../components/FileQueue";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir, previewBatch } from "../lib/ipc";
import type { OutFormat, Step } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { usePreview } from "../lib/usePreview";

interface Props {
  onBack: () => void;
}

type Mode = "horizontal" | "vertical";

const MODES: { value: Mode; labelKey: string; icon: typeof Columns2 }[] = [
  { value: "horizontal", labelKey: "mirror.leftRight", icon: Columns2 },
  { value: "vertical", labelKey: "mirror.topBottom", icon: Rows2 },
];

export default function Mirror({ onBack }: Props) {
  const { t } = useTranslation();
  const { files, add, remove, clear } = useImageFiles();
  const [mode, setMode] = useState<Mode>("horizontal");
  const [format, setFormat] = useState<FormatChoice>("same");
  const [quality, setQuality] = useState(92);
  const [preserveExif, setPreserveExif] = useState(false);
  const [output, setOutput] = useState<OutputConfig>({
    dir: null,
    suffix: "-mirrored",
    collision: "rename",
  });

  useEffect(() => {
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  // True mirror: the image joined with its own reflection (A|A).
  const buildSteps = (): Step[] => [{ kind: "mirror", direction: mode }];

  const firstFile = files[0] ?? null;
  const stepsJson = JSON.stringify(buildSteps());
  const preview = usePreview(
    () =>
      firstFile
        ? previewBatch({
            file: firstFile,
            steps: JSON.parse(stepsJson) as Step[],
            format: format === "same" ? null : (format as OutFormat),
            quality,
          })
        : null,
    [firstFile, stepsJson, format, quality],
  );

  return (
    <PageShell
      title={t("mirror.title")}
      subtitle={t("mirror.subtitle")}
      onBack={onBack}
      badge={<span className="badge badge-mint">{t("common.localBadge")}</span>}
    >
      <div className="split">
        <div>
          <FileQueue files={files} onRemove={remove} onClear={clear} />
          <DropZone
            onFiles={add}
            label={t("mirror.dropLabel")}
            hero={files.length === 0}
          />
          {firstFile && (
            <div style={{ marginTop: 16 }}>
              <PreviewCard
                beforeUrl={convertFileSrc(firstFile)}
                result={preview.result}
                loading={preview.loading}
                error={preview.error}
                note={files.length > 1 ? t("mirror.firstOfMany", { count: files.length }) : undefined}
              />
            </div>
          )}
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("common.settingsCard")}</h2>
            <div className="radio-row">
              {MODES.map(({ value, labelKey, icon: Icon }) => (
                <button
                  key={value}
                  className={`radio-chip${mode === value ? " active" : ""}`}
                  onClick={() => setMode(value)}
                >
                  <Icon /> {t(labelKey)}
                </button>
              ))}
            </div>
            <FormatQuality
              format={format}
              onFormat={setFormat}
              quality={quality}
              onQuality={setQuality}
              preserveExif={preserveExif}
              onPreserveExif={setPreserveExif}
            />
            <OutputPanel value={output} onChange={setOutput} defaultSuffix="-mirrored" />
          </div>
          <BatchRunner
            files={files}
            runLabel={t("mirror.runButton", { count: files.length })}
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
