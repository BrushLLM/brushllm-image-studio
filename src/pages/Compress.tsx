import { usePersistedState } from "../lib/persistedState";
import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import BatchRunner from "../components/BatchRunner";
import BatchInput from "../components/BatchInput";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel from "../components/OutputPanel";
import { useOutputConfig } from "../lib/useOutputConfig";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { blockedInputError, type RenderSettings } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { useBatchPreview } from "../lib/usePreview";
import { useTranslation } from "react-i18next";

export default function Compress() {
  const { t } = useTranslation();
  const { files, add, remove, clear, previewFile, selectPreview } = useImageFiles("compress");
  const [inputError, setInputError] = usePersistedState<string | null>("local.compress.inputError", null);
  /** All encodable formats stay available in Compress — the same-format
   *  fallback keeps the original bytes whenever re-encoding cannot shrink,
   *  so no format can grow its own kind. */
  const COMPRESSIBLE_FORMATS: FormatChoice[] = [
    "same", "jpeg", "png", "webp", "avif", "svg", "tiff", "bmp", "ico",
  ];

  const [format, setFormat] = usePersistedState<FormatChoice>("local.compress.format", "same");
  const [quality, setQuality] = usePersistedState("local.compress.quality", 75);
  const [preserveExif, setPreserveExif] = usePersistedState("local.compress.preserveExif", false);
  const [output, setOutput] = useOutputConfig("compress", "-min");

  const settings = useMemo<RenderSettings>(() => ({
    steps: [],
    format: format === "same" ? null : format,
    quality,
    preserve_exif: preserveExif,
  }), [format, quality, preserveExif]);
  const preview = useBatchPreview(previewFile, settings);

  return (
    <PageShell
      title={t("compress.title")}
      subtitle={t("compress.subtitle")}
    >
      {inputError && (
        <div className="banner banner-error">
          <span>{inputError}</span>
        </div>
      )}
      <div className="split">
        <BatchInput
          tool="compress"
          files={files}
          onAdd={(paths) => { setInputError(null); add(paths); }}
          onRemove={remove}
          onClear={clear}
          previewFile={previewFile}
          onSelectPreview={selectPreview}
          label={t("compress.dropLabel")}
          onBlockedInput={(files) => setInputError(blockedInputError(files))}
        >
          {previewFile && (
            <PreviewCard
              beforeUrl={convertFileSrc(previewFile)}
              onRefresh={format === "avif" ? preview.refresh : undefined}
              result={preview.result}
              loading={preview.loading}
              error={preview.error}
              afterTitle={format === "same" ? undefined : format.toUpperCase()}
              note={files.length > 1 ? t("common.batchPreviewNote") : undefined}
            />
          )}
        </BatchInput>
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
              formats={COMPRESSIBLE_FORMATS}
            />
            <OutputPanel value={output} onChange={setOutput} />
          </div>
          <BatchRunner
            tool="compress"
            files={files}
            runLabel={t("compress.runButton", { count: files.length })}
            buildJob={(selected) => ({ files: selected, ...settings, output })}
          />
        </div>
      </div>
    </PageShell>
  );
}
