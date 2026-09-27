import i18next from "../i18n";
// Shared types mirroring the Rust engine/API layer (snake_case where serde
// deserializes directly).

export type FitMode = "fit" | "fill" | "stretch";
export type OutFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "tiff"
  | "bmp"
  | "svg"
  | "ico";
export type Collision = "overwrite" | "skip" | "rename";

export type Step =
  | {
      kind: "resize";
      width?: number | null;
      height?: number | null;
      percent?: number | null;
      mode: FitMode;
      no_enlarge: boolean;
    }
  | { kind: "crop"; x: number; y: number; width: number; height: number }
  | { kind: "adjust"; brightness: number; contrast: number; saturation: number }
  | { kind: "mirror"; direction: "horizontal" | "vertical" }
  | { kind: "rotate90" }
  | { kind: "rotate180" }
  | { kind: "rotate270" }
  | { kind: "flip_h" }
  | { kind: "flip_v" };

export interface BatchJob {
  files: string[];
  steps: Step[];
  format: OutFormat | null;
  quality: number;
  preserve_exif: boolean;
  output: {
    dir: string | null;
    suffix: string;
    collision: Collision;
  };
}

export interface FileOutcome {
  input: string;
  file: string;
  status: "ok" | "skipped" | "failed";
  output_path: string | null;
  error: string | null;
  in_bytes: number;
  out_bytes: number;
  ms: number;
}

export interface BatchReport {
  total: number;
  ok: number;
  failed: number;
  skipped: number;
  in_bytes: number;
  out_bytes: number;
  ms: number;
  cancelled: boolean;
  items: FileOutcome[];
}

export interface BatchProgress {
  index: number;
  total: number;
  file: string;
  status: string;
  error: string | null;
}

export interface Settings {
  /** Image-edits gateway (every AI tool except Generate Image). */
  base_url: string;
  /** Text-to-image gateway (Generate Image). */
  base_url_t2i: string;
  default_model: string;
  output_dir: string | null;
  /** "system" | "light" | "dark" — UI theme preference. */
  appearance: string;
  /** "system" | "en" | "ja" | "de" | "ko" | "zh-CN" | "zh-TW". */
  language: string;
}

// ---- Stitch ----

export interface StitchOpts {
  direction: "vertical" | "horizontal";
  spacing: number;
  align: "start" | "center" | "end";
  background: string;
  normalize: "first" | "max" | "min";
}

export interface StitchJob {
  files: string[];
  opts: StitchOpts;
  format: OutFormat;
  quality: number;
  output: {
    dir: string | null;
    suffix: string;
    collision: Collision;
  };
}

// ---- Watermark overlay ----

export interface OverlayJob {
  image_path: string;
  overlay_b64: string;
  format: OutFormat | null;
  quality: number;
  preserve_exif: boolean;
  output: {
    dir: string | null;
    suffix: string;
    collision: Collision;
  };
}

export interface EditImage {
  image_b64: string;
  mime: string;
}

export interface EditResult {
  /** One entry per requested image (n=1 → single entry). */
  images: EditImage[];
  revised_prompt: string | null;
}

export const ACCEPTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "ico",
  "svg",
];

/**
 * Formats the interactive canvas tools (Crop & Rotate, Watermark) can load —
 * anything the embedded browser cannot render breaks their live preview.
 */
// GIF is decoded first-frame-only and cannot round-trip the canvas
// tools, so it is not accepted there (batch tools still take it).
export const CANVAS_FORMATS = ["jpg", "jpeg", "png", "webp", "bmp"];

/** AI tools send the source image to the API as-is: JPG or PNG only. */
export const AI_FORMATS = ["jpg", "jpeg", "png"];

/** EXIF metadata only lives in JPEG and TIFF files. */
export const EXIF_FORMATS = ["jpg", "jpeg", "tif", "tiff"];

/** Image formats this app cannot read (decoding needs external/C libraries). */
export const KNOWN_UNSUPPORTED_EXTENSIONS = ["avif", "heic", "heif", "jxl"];

/** Copy shown when a dropped file is an image format the app can't decode. */
export function blockedInputError(paths: string[]): string {
  const i18n = i18next;
  const exts = [
    ...new Set(
      paths.map((p) => p.split(".").pop()?.toLowerCase() ?? "").filter(Boolean),
    ),
  ];
  const list = exts.map((e) => e.toUpperCase()).join(" / ");
  return i18n.t(paths.length === 1 ? "errors.blockedOne" : "errors.blocked", {
    count: paths.length,
    list,
  });
}

/** Friendly rejection copy shown when a dropped file is not accepted. */
export function unsupportedImageError(
  count: number,
  supportedLabel: string,
): string {
  const i18n = i18next;
  return i18n.t(count === 1 ? "errors.unsupportedOne" : "errors.unsupported", {
    count,
    formats: supportedLabel,
  });
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
