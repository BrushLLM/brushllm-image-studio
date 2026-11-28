import { invoke } from "@tauri-apps/api/core";
import type {
  BatchJob,
  BatchReport,
  Collision,
  OverlayJob,
  RenderSettings,
  Settings,
  Step,
  StitchJob,
  StitchOpts,
} from "./types";

export function runBatch(job: BatchJob): Promise<BatchReport> {
  return invoke("run_batch", { job });
}

export function batchCancel(): Promise<void> {
  return invoke("batch_cancel");
}

export function runStitch(job: StitchJob): Promise<string> {
  return invoke("run_stitch", { job });
}

export function applyOverlay(job: OverlayJob): Promise<string> {
  return invoke("apply_overlay", { job });
}

/** Load the default output folder once per tool page: the configured one,
 *  or — when never configured — the system Pictures folder as the factory
 *  default, so exports always have a concrete destination. */
export async function loadDefaultOutputDir(): Promise<string | null> {
  try {
    const settings = await getSettings();
    if (settings.output_dir) return settings.output_dir;
    return await picturesDir();
  } catch {
    return null;
  }
}

/**
 * Read a local image as a data: URL. Canvas drawing of asset-protocol images
 * taints the canvas (toBlob blocked); data URLs are safe.
 */
export function readAssetDataUrl(path: string): Promise<string> {
  return invoke("read_asset", { path });
}

/** The OS Pictures folder path (for the one-click default output). */
export function picturesDir(): Promise<string | null> {
  return invoke("pictures_dir");
}

/** Queue-friendly file facts (name + byte size). */
export function fileMeta(path: string): Promise<{ name: string; bytes: number }> {
  return invoke("file_meta", { path });
}

// ---- EXIF ----

export interface ExifField {
  tag: string;
  group: string;
  value: string;
  is_gps: boolean;
  /** Prefill for the edit form (plain text, dashed dates, decimal GPS). */
  edit_value: string | null;
}

export function readExif(path: string): Promise<ExifField[]> {
  return invoke("read_exif", { path });
}

export type ExifAction =
  | { kind: "strip_all" }
  | { kind: "strip_gps" }
  | {
      kind: "edit";
      date_time?: string | null;
      make?: string | null;
      model?: string | null;
      gps_lat?: string | null;
      gps_lon?: string | null;
      description?: string | null;
      artist?: string | null;
      copyright?: string | null;
    };

export interface ExifJobArgs {
  image_path: string;
  action: ExifAction;
  output: {
    dir: string | null;
    suffix: string;
    collision: Collision;
  };
}

export function applyExif(job: ExifJobArgs): Promise<string> {
  return invoke("apply_exif", { job });
}

// ---- Real previews ----

export interface PreviewOutcome {
  data_url: string;
  bytes: number;
  in_bytes: number;
}

export function previewBatch(
  file: string,
  { preserve_exif, ...settings }: RenderSettings,
): Promise<PreviewOutcome> {
  return invoke("preview_batch", { file, ...settings, preserveExif: preserve_exif });
}

export interface CropPreview {
  data_url: string;
  width: number;
  height: number;
}

export function previewCrop(file: string, steps: Step[]): Promise<CropPreview> {
  return invoke("preview_crop", { file, steps });
}

export function previewStitch(files: string[], opts: StitchOpts): Promise<PreviewOutcome> {
  return invoke("preview_stitch", { files, opts });
}

export function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export function saveSettings(settings: Settings): Promise<void> {
  return invoke("save_settings", { settings });
}

export function saveBytes(path: string, dataB64: string): Promise<void> {
  return invoke("save_bytes", { path, dataB64 });
}

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  notes: string;
  assets: UpdateAsset[];
  update_available: boolean;
  release_url: string;
}

export function checkUpdate(): Promise<UpdateInfo> {
  return invoke("check_update");
}
