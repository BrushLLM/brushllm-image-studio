import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { revealBatchOutput, startBatch, useBatchState } from "../lib/batchState";
import { batchCancel } from "../lib/ipc";
import { pageLabelKey, type LocalToolId } from "../lib/tools";
import { formatBytes, type BatchJob } from "../lib/types";

interface Props {
  tool: LocalToolId;
  files: string[];
  buildJob: (files: string[]) => BatchJob;
  /** Shown on the run button, e.g. "Convert 12 images". */
  runLabel: string;
}

export default function BatchRunner({ tool, files, buildJob, runLabel }: Props) {
  const { t } = useTranslation();
  const job = useBatchState();
  const { owner, running } = job;
  const isOwner = owner === tool;
  const progress = isOwner ? job.progress : null;
  const report = isOwner ? job.report : null;
  const error = isOwner ? job.error : null;

  const done = progress ? progress.index + (progress.status ? 1 : 0) : 0;
  const pct = progress ? Math.round((done / Math.max(1, progress.total)) * 100) : 0;
  const firstOutput = report?.items.find((item) => item.status === "ok" && item.output_path)?.output_path;
  const saved =
    report && report.out_bytes > 0 && report.in_bytes > 0
      ? Math.round((1 - report.out_bytes / report.in_bytes) * 100)
      : null;

  return (
    <div className="card">
      <h2 className="card-title">{t("common.run")}</h2>
      <button
        className="btn btn-primary btn-block"
        onClick={() => startBatch(tool, files, buildJob)}
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
        <button className="btn btn-block mt-2" onClick={() => batchCancel()}>
          {t("common.cancel")}
        </button>
      )}

      {running && !isOwner && owner && (
        <p className="status-note">{t("batch.processingIn", { tool: t(pageLabelKey(owner)) })}</p>
      )}
      {progress && (
        <>
          <div className="progress-track" role="progressbar" aria-label={t("common.processing")}
            aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-label">
            {done} / {progress.total} — {progress.file}
            {progress.error ? ` (${progress.error})` : ""}
          </div>
        </>
      )}

      {error && (
        <div className="banner banner-error mt-3">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-3">
          {saved !== null && saved > 0 ? (
            <div className="result-hero">
              <span className="hero-number">−{saved}%</span>
              <span className="dim">
                {formatBytes(report.in_bytes)} → {formatBytes(report.out_bytes)}
              </span>
            </div>
          ) : null}
          <div className="result-summary" style={{ marginTop: saved ? 0 : 4 }}>
            <span className="big" role="status">{t("batch.done", { count: report.ok })}</span>
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
              {t("batch.stats", { sec: (report.ms / 1000).toFixed(1), ms: report.ok > 0 ? Math.round(report.ms / report.ok) : 0 })}
            </span>
          </div>
          {firstOutput && (
            <button type="button" className="btn btn-sm" onClick={() => revealBatchOutput(firstOutput, report)}>
              <FolderOpen aria-hidden="true" /> {t("common.openFolder")}
            </button>
          )}
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
                      {t(item.status === "failed" ? "batch.failed" : "batch.skipped", { count: 1 })}
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
