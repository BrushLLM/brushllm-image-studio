import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
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

function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

export default function BatchRunner({ files, buildJob, runLabel }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const { t } = useTranslation();
  const [report, setReport] = useState<BatchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<Promise<UnlistenFn> | null>(null);

  useEffect(() => {
    const unlisten = listen<BatchProgress>("batch-progress", (event) => {
      setProgress(event.payload);
    });
    unlistenRef.current = unlisten;
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const run = async () => {
    if (files.length === 0 || running) return;
    setRunning(true);
    setReport(null);
    setError(null);
    setProgress({ index: 0, total: files.length, file: "", status: "", error: null });
    try {
      const result = await runBatch(buildJob(files));
      setReport(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
      setProgress(null);
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
              if (first?.output_path) openPath(parentDir(first.output_path)).catch(() => {});
            }}          >
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
