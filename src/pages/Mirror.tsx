import { usePersistedState } from "../lib/persistedState";
import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Columns2, Rows2 } from "lucide-react";
import BatchRunner from "../components/BatchRunner";
import BatchInput from "../components/BatchInput";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel from "../components/OutputPanel";
import { useOutputConfig } from "../lib/useOutputConfig";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { useTranslation } from "react-i18next";
import type { RenderSettings } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { useBatchPreview } from "../lib/usePreview";

type Mode = "horizontal" | "vertical";

const MODES: { value: Mode; labelKey: string; icon: typeof Columns2 }[] = [
  { value: "horizontal", labelKey: "mirror.leftRight", icon: Columns2 },
  { value: "vertical", labelKey: "mirror.topBottom", icon: Rows2 },
];

export default function Mirror() {
  const { t } = useTranslation();
  const { files, add, remove, clear, previewFile, selectPreview } = useImageFiles("mirror");
  const [mode, setMode] = usePersistedState<Mode>("local.mirror.mode", "horizontal");
  const [format, setFormat] = usePersistedState<FormatChoice>("local.mirror.format", "same");
  const [quality, setQuality] = usePersistedState("local.mirror.quality", 92);
  const [preserveExif, setPreserveExif] = usePersistedState("local.mirror.preserveExif", false);
  const [output, setOutput] = useOutputConfig("mirror", "-mirrored");

  const settings = useMemo<RenderSettings>(() => ({
    steps: [{ kind: "mirror", direction: mode }],
    format: format === "same" ? null : format,
    quality,
    preserve_exif: preserveExif,
  }), [mode, format, quality, preserveExif]);
  const preview = useBatchPreview(previewFile, settings);

  return (
    <PageShell
      title={t("mirror.title")}
      subtitle={t("mirror.subtitle")}
    >
      <div className="split">
        <BatchInput
          tool="mirror"
          files={files}
          onAdd={add}
          onRemove={remove}
          onClear={clear}
          previewFile={previewFile}
          onSelectPreview={selectPreview}
          label={t("mirror.dropLabel")}
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
            tool="mirror"
            files={files}
            runLabel={t("mirror.runButton", { count: files.length })}
            buildJob={(selected) => ({ files: selected, ...settings, output })}
          />
        </div>
      </div>
    </PageShell>
  );
}
