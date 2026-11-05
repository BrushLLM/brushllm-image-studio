import { usePersistedState } from "../lib/persistedState";
import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import BatchRunner from "../components/BatchRunner";
import DropZone from "../components/DropZone";
import FileQueue from "../components/FileQueue";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { loadDefaultOutputDir, previewBatch } from "../lib/ipc";
import { blockedInputError, type OutFormat } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { usePreview } from "../lib/usePreview";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
  /** Files dropped on the home grid are routed here. */
  initialFiles?: string[] | null;
  /** Notice routed from the home grid (e.g. unsupported-format drop). */
  initialNotice?: string | null;
}

export default function Convert({ onBack, initialFiles, initialNotice }: Props) {
  const { t } = useTranslation();
  const { files, add, remove, clear } = useImageFiles("convert", initialFiles ?? undefined);
  const [inputError, setInputError] = usePersistedState<string | null>("local.convert.inputError", initialNotice ?? null);
  const [format, setFormat] = usePersistedState<FormatChoice>("local.convert.format", "jpeg");
  const [quality, setQuality] = usePersistedState("local.convert.quality", 90);
  const [preserveExif, setPreserveExif] = usePersistedState("local.convert.preserveExif", false);
  const [output, setOutput] = usePersistedState<OutputConfig>("local.convert.output", {
    dir: null,
    suffix: "",
    collision: "rename",
  });

  useEffect(() => {
    if (output.dir) return;
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const firstFile = files[0] ?? null;
  const preview = usePreview(
    () =>
      firstFile
        ? previewBatch({
            preserveExif: preserveExif,
            file: firstFile,
            steps: [],
            format: format === "same" ? null : (format as OutFormat),
            quality,
          })
        : null,
    [firstFile, format, quality, preserveExif],
    format === "avif",
  );

  return (
    <PageShell
      title={t("convert.title")}
      subtitle={t("convert.subtitle")}
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
            onFiles={(paths) => { setInputError(null); add(paths); }}
            label={t("convert.dropLabel")}
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
                afterTitle={format === "same" ? "PNG" : format.toUpperCase()}
                note={files.length > 1 ? t("convert.firstOfMany", { count: files.length }) : undefined}
              />
            </div>
          )}
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("common.settingsCard")}</h2>
            <FormatQuality
              format={format}
              onFormat={setFormat}
              quality={quality}
              onQuality={setQuality}
              preserveExif={preserveExif}
              onPreserveExif={setPreserveExif}
            />
            <OutputPanel value={output} onChange={setOutput} defaultSuffix="-converted" />
          </div>
          <BatchRunner
            files={files}
            runLabel={t("convert.runButton", { count: files.length })}
            buildJob={(selected) => ({
              files: selected,
              steps: [],
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
