import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { batchCancel, runBatch } from "../lib/ipc";
import { formatBytes, type BatchJob, type BatchProgress, type BatchReport } from "../lib/types";

interface Props {
  files: string[];
  buildJob: (files: string[]) => BatchJob;
  /** Shown on the run button, e.g. "Convert 12 images". */
  runLabel: string;
}

/**
 * Global single-task batch state. The backend runs one batch at a time, so the
 * job lives at module scope: leaving and re-entering a tool page keeps the
 * running flag, live progress, the cancel button and the last report/error.
 */
interface BatchState {
  running: boolean;
  progress: BatchProgress | null;
  report: BatchReport | null;
  error: string | null;
}

let activeJob: BatchState = {
  running: false,
  progress: null,
  report: null,
  error: null,
};

const jobListeners = new Set<() => void>();

function subscribeJob(listener: () => void): () => void {
  jobListeners.add(listener);
  return () => {
    jobListeners.delete(listener);
  };
}

function getJobSnapshot(): BatchState {
  return activeJob;
}

function updateJob(patch: Partial<BatchState>): void {
  activeJob = { ...activeJob, ...patch };
  jobListeners.forEach((fn) => fn());
}

// One progress listener shared by every BatchRunner instance; the unlisten
// handle is cached at module scope so the listener outlives page navigation.
const unlistenProgress: Promise<UnlistenFn> = listen<BatchProgress>(
  "batch-progress",
  (event) => {
    updateJob({ progress: event.payload });
  },
);
unlistenProgress.catch(() => {
  // Registration only fails outside Tauri (e.g. in tests); batches still run,
  // just without live progress updates.
});

export default function BatchRunner({ files, buildJob, runLabel }: Props) {
  const { t } = useTranslation();
  const { running, progress, report, error } = useSyncExternalStore(
    subscribeJob,
    getJobSnapshot,
  );

  const run = async () => {
    if (files.length === 0 || running) return;
    updateJob({
      running: true,
      report: null,
      error: null,
      progress: { index: 0, total: files.length, file: "", status: "", error: null },
    });
    try {
      const result = await runBatch(buildJob(files));
      updateJob({ report: result });
    } catch (e) {
      updateJob({ error: String(e) });
    } finally {
      updateJob({ running: false, progress: null });
    }
  };

  const done = progress ? progress.index + (progress.status ? 1 : 0) : 0;
  const pct = progress ? Math.round((done / Math.max(1, progress.total)) * 100) : 0;
  const saved =
    report && report.out_bytes > 0 && report.in_bytes > 0
      ? Math.round((1 - report.out_bytes / report.in_bytes) * 100)
      : null;

  return (
    <div className="card">
      <h2 className="card-title">{t("common.run")}</h2>
      <button
        className="btn btn-primary btn-block"
        onClick={run}
        disabled={files.length === 0 || running}
      >
        {running ? (
          <>
            <span className="spinner" /> {t("common.processing")}
          </>
        ) : (
          runLabel
        )}
      </button>

      {running && (
        <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => batchCancel()}>
          Cancel
        </button>
      )}

      {progress && (
        <>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-label">
            {done} / {progress.total} — {progress.file}
            {progress.error ? ` (${progress.error})` : ""}
          </div>
        </>
      )}

      {error && (
        <div className="banner banner-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {report && (
        <div style={{ marginTop: 14 }}>
          {saved !== null && saved > 0 ? (
            <div className="result-hero">
              <span className="hero-number">−{saved}%</span>
              <span className="dim">
                {formatBytes(report.in_bytes)} → {formatBytes(report.out_bytes)}
              </span>
            </div>
          ) : null}
          <div className="result-summary" style={{ marginTop: saved ? 0 : 4 }}>
            <span className="big">{t("batch.done", { count: report.ok })}</span>
            {report.failed > 0 && (
              <span className="badge badge-fail">{t("batch.failed", { count: report.failed })}</span>
            )}
            {report.skipped > 0 && (
              <span className="badge badge-skip">{t("batch.skipped", { count: report.skipped })}</span>
            )}
            {report.cancelled && (
              <span className="badge badge-skip">{t("batch.cancelledBadge")}</span>
            )}
            <span className="dim">
              in {(report.ms / 1000).toFixed(1)}s
              {report.ok > 0 ? ` · ${Math.round(report.ms / report.ok)} ms/image avg` : ""}
            </span>
          </div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 2 }}
            onClick={() => {
              const first = report.items.find((item) => item.status === "ok" && item.output_path);
              if (first?.output_path) {
                revealItemInDir(first.output_path).catch((e) => updateJob({ error: String(e) }));
              }
            }}
          >
            <FolderOpen /> {t("common.openFolder")}
          </button>
          {report.items.some((item) => item.status !== "ok") && (
            <div className="outcome-list">
              {report.items
                .filter((item) => item.status !== "ok")
                .map((item, index) => (
                  <div className="outcome-row" key={index}>
                    <span
                      className={`badge ${
                        item.status === "failed" ? "badge-fail" : "badge-skip"
                      }`}
                    >
                      {item.status === "failed" ? "failed" : "skipped"}
                    </span>
                    <span className="oc-name" title={item.input}>
                      {item.file}
                    </span>
                    <span className="oc-error" title={item.error ?? ""}>
                      {item.error}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
