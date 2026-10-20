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
  /** Label for the "after" pane, e.g. "AVIF · q75". */
  afterTitle?: string;
}

export default function PreviewCard({
  beforeUrl,
  result,
  loading,
  error,
  note,
  afterTitle,
}: Props) {
  // An empty beforeUrl means "result only" (e.g. stitch composites).
  const showBefore = beforeUrl !== "";
  if (!beforeUrl && !result && !loading && !error) return null;
  const { t } = useTranslation();
  const saved =
    result && result.in_bytes > 0
      ? Math.round((1 - result.bytes / result.in_bytes) * 100)
      : null;

  return (
    <div className="card">
      <div className="row row-center mb-3">
        <h2 className="m-0">{t("common.preview")}</h2>
        <div className="flex-1" />
        {result && saved !== null && saved > 0 && (
          <span className="badge badge-ok">{t("errors.smallerBadge", { pct: saved })}</span>
        )}
        {loading && (
          <span className="status-note">
            <span className="spinner" /> {t("errors.rendering")}
          </span>
        )}
      </div>

      {showBefore && result ? (
        <div style={{ textAlign: "center" }}>
          <CompareSlider
            before={beforeUrl}
            after={result.data_url}
            beforeTag={`${t("errors.original")} · ${formatBytes(result.in_bytes)}`}
            afterTag={`${afterTitle ? `${afterTitle} · ` : ""}${formatBytes(result.bytes)}`}
          />
        </div>
      ) : (
        <div className="preview-row">
          {showBefore && (
            <figure className="preview-fig">
              <img src={beforeUrl} alt="before" />
              <figcaption>
                Before{result ? ` · ${formatBytes(result.in_bytes)}` : ""}
              </figcaption>
            </figure>
          )}
          {showBefore && <div className="preview-arrow">→</div>}
          <figure className="preview-fig">
            {result ? (
              <img src={result.data_url} alt="after" />
            ) : (
              <div className="preview-placeholder">
                {loading ? "…" : error ? t("errors.cannotPreview") : t("errors.adjustSettings")}
              </div>
            )}
            <figcaption>
              After
              {result ? (
                <>
                  {" · "}
                  {formatBytes(result.bytes)}
                  {saved !== null && saved > 0 ? ` · −${saved}%` : ""}
                </>
              ) : (
                ""
              )}
            </figcaption>
          </figure>
        </div>
      )}
      {note && <p className="status-note mt-3">{note}</p>}
      {error && (
        <p className="status-note mt-2 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
