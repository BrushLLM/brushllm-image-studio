import { invoke } from "@tauri-apps/api/core";
import type {
  BatchJob,
  BatchReport,
  Collision,
  EditResult,
  OutFormat,
  OverlayJob,
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

export function aiGenerate(args: {
  model: string;
  prompt: string;
  size?: string | null;
  quality?: string | null;
  n?: number | null;
}): Promise<EditResult> {
  return invoke("ai_generate", {
    model: args.model,
    prompt: args.prompt,
    size: args.size ?? null,
    quality: args.quality ?? null,
    n: args.n ?? null,
  });
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

export function previewBatch(args: {
  file: string;
  steps: Step[];
  format: OutFormat | null;
  quality: number;
}): Promise<PreviewOutcome> {
  return invoke("preview_batch", args);
}

export function previewStitch(files: string[], opts: StitchOpts): Promise<PreviewOutcome> {
  return invoke("preview_stitch", { files, opts });
}

export interface AiEditArgs {
  model: string;
  prompt: string;
  /** Primary image first, then up to 3 reference images. */
  imagePaths: string[];
  maskB64?: string | null;
  size?: string | null;
  quality?: string | null;
  n?: number | null;
}

export function aiEdit(args: AiEditArgs): Promise<EditResult> {
  return invoke("ai_edit", {
    model: args.model,
    prompt: args.prompt,
    imagePaths: args.imagePaths,
    maskB64: args.maskB64 ?? null,
    size: args.size ?? null,
    quality: args.quality ?? null,
    n: args.n ?? null,
  });
}

export function apiKeyStatus(): Promise<boolean> {
  return invoke("api_key_status");
}

export function apiKeySet(key: string): Promise<void> {
  return invoke("api_key_set", { key });
}

export function apiKeyClear(): Promise<void> {
  return invoke("api_key_clear");
}

export function apiTest(
  baseUrl?: string | null,
  baseUrlT2i?: string | null,
  apiKey?: string | null,
): Promise<{ models: string[]; models_t2i: string[] }> {
  return invoke("api_test", {
    baseUrl: baseUrl ?? null,
    baseUrlT2i: baseUrlT2i ?? null,
    apiKey: apiKey ?? null,
  });
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

export function downloadUpdate(url: string, fileName: string): Promise<string> {
  return invoke("download_update", { url, fileName });
}
