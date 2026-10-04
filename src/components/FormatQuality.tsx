import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { OutFormat } from "../lib/types";

export type FormatChoice = OutFormat | "same";

interface Props {
  format: FormatChoice;
  onFormat: (format: FormatChoice) => void;
  quality: number;
  onQuality: (quality: number) => void;
  preserveExif: boolean;
  onPreserveExif: (value: boolean) => void;
  /** Restrict the picker (e.g. Compress only offers formats that can shrink). */
  formats?: FormatChoice[];
}

// Labels are resolved at render time (t is only available in components).
const FORMAT_OPTIONS: FormatChoice[] = [
  "same",
  "jpeg",
  "png",
  "webp",
  "avif",
  "svg",
  "tiff",
  "bmp",
  "ico",
];

const QUALITY_HINT_KEYS: Record<FormatChoice, string> = {
  jpeg: "convert.hintJpeg",
  png: "convert.hintPng",
  webp: "convert.hintWebp",
  avif: "convert.hintAvif",
  tiff: "convert.hintTiff",
  bmp: "convert.hintBmp",
  svg: "convert.hintSvg",
  ico: "convert.hintIco",
  same: "",
};

/** Formats where the quality slider / preset chips apply. */
const QUALITY_FORMATS: FormatChoice[] = ["jpeg", "png", "webp", "avif"];

const QUALITY_PRESETS: { labelKey: string; value: number }[] = [
  { labelKey: "common.presetSmaller", value: 50 },
  { labelKey: "common.presetBalanced", value: 75 },
  { labelKey: "common.presetBest", value: 92 },
];

export default function FormatQualityWithI18n({
  format,
  onFormat,
  quality,
  onQuality,
  preserveExif,
  onPreserveExif,
  formats,
}: Props) {
  const { t } = useTranslation();
  const showQuality = QUALITY_FORMATS.includes(format);
  const options = formats ?? FORMAT_OPTIONS;
  return (
    <>
      <div className="field">
        <label>{t('convert.format')}</label>
        <div className="radio-row">
          {options.map((option) => (
            <button
              key={option}
              className={`radio-chip${format === option ? " active" : ""}`}
              onClick={() => onFormat(option)}
            >
              {option === "same" ? t("convert.original") : option.toUpperCase()}
            </button>
          ))}
        </div>
        {format === "same" && (
          <div className="hint">{t('convert.originalHint')}</div>
        )}
      </div>
      {showQuality && (
        <div className="field">
          <div className="range-head">
            <label style={{ marginBottom: 0 }}>{t("convert.quality")}</label>
            <span className="range-value">{quality}</span>
          </div>
          <input
            type="range"
            className="range"
            min={1}
            max={100}
            value={quality}
            style={{ "--val": `${quality}%` } as CSSProperties}
            onChange={(e) => onQuality(Number(e.target.value))}
          />
          <div className="preset-chips">
            {QUALITY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                className={`chip${quality === preset.value ? " active" : ""}`}
                onClick={() => onQuality(preset.value)}
              >
                {t(preset.labelKey)} · {preset.value}
              </button>
            ))}
          </div>
          <div className="hint">{t(QUALITY_HINT_KEYS[format])}</div>
        </div>
      )}
      {format === "jpeg" && (
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={preserveExif}
              onChange={(e) => onPreserveExif(e.target.checked)}
            />
            {t('convert.exif')}
          </label>
        </div>
      )}
    </>
  );
}
