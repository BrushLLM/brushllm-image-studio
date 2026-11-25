import { Image } from "lucide-react";
import CompareSlider from "./CompareSlider";
import type { PreviewOutcome } from "../lib/ipc";
import { formatBytes } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  beforeUrl: string;
  result: PreviewOutcome | null;
  loading: boolean;
  error: string | null;
  note?: string;
  afterTitle?: string;
  onRefresh?: () => void;
}

export default function PreviewCard({ beforeUrl, result, loading, error, note, afterTitle, onRefresh }: Props) {
  const { t } = useTranslation();
  if (!beforeUrl && !result && !loading && !error) return null;

  const before = t("errors.original");
  const after = afterTitle ?? t("common.result");
  const saved = result && result.in_bytes > 0
    ? Math.round((1 - result.bytes / result.in_bytes) * 100)
    : 0;

  return (
    <section className="studio-preview" aria-label={t("common.preview")}>
      <header className="preview-heading">
        <h2><span className="preview-icon"><Image aria-hidden="true" /></span>{t("common.preview")}</h2>
        {result && saved > 0 && (
          <span className="badge badge-ok">{t("errors.smallerBadge", { pct: saved })}</span>
        )}
        {loading && (
          <span className="status-note" role="status">
            <span className="spinner" aria-hidden="true" /> {t("errors.rendering")}
          </span>
        )}
        {onRefresh && (
          <button type="button" className="btn btn-sm" disabled={loading} onClick={onRefresh}>
            {t("common.exactPreview")}
          </button>
        )}
      </header>
      <div className="preview-stage" aria-busy={loading}>
        {beforeUrl && result ? (
          <CompareSlider
            before={beforeUrl}
            after={result.data_url}
            beforeTag={`${before} · ${formatBytes(result.in_bytes)}`}
            afterTag={`${after} · ${formatBytes(result.bytes)}`}
          />
        ) : beforeUrl || result ? (
          <figure className="preview-single">
            <img src={result?.data_url ?? beforeUrl} alt={result ? after : before} />
            <figcaption>{result ? `${after} · ${formatBytes(result.bytes)}` : before}</figcaption>
          </figure>
        ) : (
          <p className="status-note">{loading ? t("errors.rendering") : t("errors.cannotPreview")}</p>
        )}
      </div>
      {(note || onRefresh || error) && (
        <footer className="preview-footer">
          {onRefresh && !result && !loading && !error && (
            <p className="status-note">{t("common.manualPreviewHint")}</p>
          )}
          {note && <p className="status-note">{note}</p>}
          {error && <p className="status-note text-danger" role="alert">{error}</p>}
        </footer>
      )}
    </section>
  );
}
