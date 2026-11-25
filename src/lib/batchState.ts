import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { runBatch } from "./ipc";
import type { LocalToolId } from "./tools";
import type { BatchJob, BatchProgress, BatchReport, FileOutcome } from "./types";

type FileStatuses = ReadonlyMap<string, FileOutcome["status"] | null>;

interface BatchState {
  owner: LocalToolId | null;
  running: boolean;
  progress: BatchProgress | null;
  report: BatchReport | null;
  error: string | null;
  fileStatuses: FileStatuses;
}

const emptyStatuses: FileStatuses = new Map();
const listeners = new Set<() => void>();

let batch: BatchState = {
  owner: null,
  running: false,
  progress: null,
  report: null,
  error: null,
  fileStatuses: emptyStatuses,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function update(patch: Partial<BatchState>) {
  batch = { ...batch, ...patch };
  listeners.forEach((listener) => listener());
}

// A single native subscription outlives tool navigation.
void listen<BatchProgress>("batch-progress", ({ payload }) => {
  if (!batch.running || !payload.status) return;
  const fileStatuses = batch.fileStatuses.has(payload.file)
    ? new Map(batch.fileStatuses).set(payload.file, payload.status)
    : batch.fileStatuses;
  update({
    progress: payload,
    fileStatuses,
  });
}).catch(() => {});

export function useBatchState() {
  return useSyncExternalStore(subscribe, () => batch);
}

export function useBatchFileStatuses(tool: LocalToolId) {
  return useSyncExternalStore(subscribe, () => batch.owner === tool ? batch.fileStatuses : emptyStatuses);
}

export function forgetBatchFiles(tool: LocalToolId, files: string[]) {
  if (batch.owner !== tool) return;
  const fileStatuses = new Map(batch.fileStatuses);
  for (const file of files) fileStatuses.delete(file);
  if (fileStatuses.size !== batch.fileStatuses.size) update({ fileStatuses });
}

export async function startBatch(tool: LocalToolId, files: string[], buildJob: (files: string[]) => BatchJob) {
  if (files.length === 0 || batch.running) return;
  update({
    owner: tool,
    running: true,
    report: null,
    error: null,
    progress: { index: 0, total: files.length, file: "", status: "", error: null },
    fileStatuses: new Map(files.map((file) => [file, null])),
  });
  try {
    const report = await runBatch(buildJob(files));
    const fileStatuses = new Map(batch.fileStatuses);
    for (const { input, status } of report.items) {
      if (fileStatuses.has(input)) fileStatuses.set(input, status);
    }
    update({
      report,
      fileStatuses,
      running: false,
      progress: null,
    });
  } catch (e) {
    update({ error: String(e), running: false, progress: null });
  }
}

export async function revealBatchOutput(path: string, report: BatchReport) {
  try {
    await revealItemInDir(path);
  } catch (e) {
    if (batch.report === report) update({ error: String(e) });
  }
}
