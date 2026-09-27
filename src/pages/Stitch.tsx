import { useEffect, useState, type CSSProperties } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import DropZone from "../components/DropZone";
import FormatQuality, { type FormatChoice } from "../components/FormatQuality";
import OutputPanel, { type OutputConfig } from "../components/OutputPanel";
import PageShell from "../components/PageShell";
import PreviewCard from "../components/PreviewCard";
import { loadDefaultOutputDir, previewStitch, runStitch } from "../lib/ipc";
import { blockedInputError, type OutFormat, type StitchOpts } from "../lib/types";
import { useImageFiles } from "../lib/useImageFiles";
import { usePreview } from "../lib/usePreview";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
}

export default function Stitch({ onBack }: Props) {
  const { t } = useTranslation();
  const { files, add, remove, clear, replace } = useImageFiles();
  const [direction, setDirection] = useState<StitchOpts["direction"]>("vertical");
  const [inputError, setInputError] = useState<string | null>(null);
  const [spacing, setSpacing] = useState(0);
  const [align, setAlign] = useState<StitchOpts["align"]>("center");
  const [background, setBackground] = useState("#ffffff");
  const [normalize, setNormalize] = useState<StitchOpts["normalize"]>("first");
  const [format, setFormat] = useState<FormatChoice>("jpeg");
  const [quality, setQuality] = useState(90);
  const [preserveExif, setPreserveExif] = useState(false);
  const [output, setOutput] = useState<OutputConfig>({
    dir: null,
    suffix: "-stitched",
    collision: "rename",
  });
  const [busy, setBusy] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDefaultOutputDir().then((dir) => {
      if (dir) setOutput((prev) => ({ ...prev, dir }));
    });
  }, []);

  const optsJson = JSON.stringify({ direction, spacing, align, background, normalize });
  const filesKey = files.join("\n");
  const preview = usePreview(
    () => (files.length >= 2 ? previewStitch(files, JSON.parse(optsJson)) : null),
    [filesKey, optsJson, files.length],
  );

  const move = (index: number, delta: number) => {
    const next = [...files];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    replace(next);
  };

  const run = async () => {
    if (files.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setResultPath(null);
    try {
      const path = await runStitch({
        files,
        opts: { direction, spacing, align, background, normalize },
        format: (format === "same" ? "jpeg" : format) as OutFormat,
        quality,
        output: { dir: output.dir, suffix: output.suffix, collision: output.collision },
      });
      setResultPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title={t("stitch.title")}
      subtitle={t("stitch.subtitle")}
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
          {files.length > 0 && (
            <div className="card">
              <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>
                  {t("stitch.orderMatters", { count: files.length })}
                </h2>
                <div style={{ flex: 1 }} />
                <button className="btn btn-sm" onClick={clear}>
                  Remove all
                </button>
              </div>
              <div className="queue" style={{ alignItems: "flex-start" }}>
                {files.map((file, index) => (
                  <div key={`${file}-${index}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="queue-item" style={{ width: "auto" }}>
                      <button className="q-remove" onClick={() => remove(index)} title="Remove">
                        ✕
                      </button>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--violet)",
                        }}
                      >
                        #{index + 1}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => move(index, -1)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => move(index, 1)}
                        disabled={index === files.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                    <div className="q-name" style={{ width: 86 }} title={file}>
                      {file.replace(/\\/g, "/").split("/").pop()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DropZone
            onFiles={add}
            label={t("stitch.dropLabel")}
            hero={files.length === 0}
            onBlockedInput={(files) => setInputError(blockedInputError(files))}
          />
          {files.length >= 2 && (
            <div style={{ marginTop: 16 }}>
              <PreviewCard
                beforeUrl=""
                result={preview.result}
                loading={preview.loading}
                error={preview.error}
                note={
                  files.length > 10
                    ? t("stitch.firstTen")
                    : t("stitch.exactPreview")
                }
              />
            </div>
          )}
        </div>
        <div className="side-col">
          <div className="card">
            <h2 className="card-title">{t("common.settingsCard")}</h2>
            <div className="field">
              <label>{t("stitch.direction")}</label>
              <div className="radio-row">
                <button
                  className={`radio-chip${direction === "vertical" ? " active" : ""}`}
                  onClick={() => setDirection("vertical")}
                >
                  {t("stitch.vertical")}
                </button>
                <button
                  className={`radio-chip${direction === "horizontal" ? " active" : ""}`}
                  onClick={() => setDirection("horizontal")}
                >
                  {t("stitch.horizontal")}
                </button>
              </div>
            </div>
            <div className="field">
              <div className="range-head">
                <label style={{ marginBottom: 0 }}>
                  {t("stitch.spacing")} {spacing > 0 ? t("stitch.spacingFill") : ""}
                </label>
                <span className="range-value">{spacing}px</span>
              </div>
              <input
                type="range"
                className="range"
                min={0}
                max={200}
                value={spacing}
                style={{ "--val": `${(spacing / 200) * 100}%` } as CSSProperties}
                onChange={(e) => setSpacing(Number(e.target.value))}
              />
            </div>
            {spacing > 0 && (
              <div className="field">
                <label>{t("stitch.fillColor")}</label>
                <input
                  type="color"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  style={{ width: 60, height: 34, padding: 2 }}
                />
              </div>
            )}
            <div className="field">
              <label>
                {t("stitch.alignment")} ({direction === "vertical" ? t("stitch.acrossWidth") : t("stitch.alongHeight")})
              </label>
              <div className="radio-row">
                {(
                  [
                    ["start", direction === "vertical" ? t("stitch.left") : t("stitch.top")],
                    ["center", t("stitch.center")],
                    ["end", direction === "vertical" ? t("stitch.right") : t("stitch.bottom")],
                  ] as [StitchOpts["align"], string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`radio-chip${align === value ? " active" : ""}`}
                    onClick={() => setAlign(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{t("stitch.normalizeSizeTo")}</label>
              <select value={normalize} onChange={(e) => setNormalize(e.target.value as StitchOpts["normalize"])}>
                <option value="first">{t("stitch.firstWidth")}/{t("stitch.firstHeight")}</option>
                <option value="max">{t("stitch.largest")}</option>
                <option value="min">{t("stitch.smallest")}</option>
              </select>
              <div className="hint">
                {t("stitch.normalizeHint")}
              </div>
            </div>
            <FormatQuality
              format={format === "same" ? "jpeg" : format}
              onFormat={setFormat}
              quality={quality}
              onQuality={setQuality}
              preserveExif={preserveExif}
              onPreserveExif={setPreserveExif}
            />
            <OutputPanel value={output} onChange={setOutput} defaultSuffix="-stitched" />
          </div>

          <div className="card">
            <button
              className="btn btn-primary btn-block"
              onClick={run}
              disabled={files.length < 2 || busy}
            >
              {busy ? (
                <>
                  <span className="spinner" /> {t("stitch.stitching")}
                </>
              ) : (
                t("stitch.stitchButton")
              )}
            </button>
            {error && (
              <div className="banner banner-error" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}
            {resultPath && (
              <div className="banner banner-warn" style={{ marginTop: 12, background: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" }}>
                <span>✓ Saved to {resultPath}</span>
                <span className="banner-link" onClick={() => revealItemInDir(resultPath)}>
                  Show in folder
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
