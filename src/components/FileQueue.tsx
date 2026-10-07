import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, FileImage, Loader, X } from "lucide-react";
import { fileMeta } from "../lib/ipc";
import { formatBytes, type BatchProgress } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  files: string[];
  onRemove: (index: number) => void;
  onClear: () => void;
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/**
 * Thumbnail queue with per-file sizes and a live status ring driven by the
 * global "batch-progress" event (matched by full path).
 */
export default function FileQueue({ files, onRemove, onClear }: Props) {
  const { t } = useTranslation();
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  // Formats the WebView cannot render (e.g. TIFF) fail <img> loading — show
  // a neutral tile instead of a broken-image icon.
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const markBroken = (key: string) =>
    setBroken((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

  // Resolve byte sizes for newly added files. Requested paths are tracked
  // in a ref (in-flight + done): the effect fires fileMeta only for paths
  // never asked before, so each file is requested exactly once per
  // component lifetime — sizes landing (setSizes) no longer re-triggers
  // the effect, and removing a file never re-sends the survivors.
  const requestedMeta = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const file of files) {
      if (requestedMeta.current.has(file)) continue;
      requestedMeta.current.add(file);
      fileMeta(file)
        .then((meta) => {
          setSizes((prev) => ({ ...prev, [file]: meta.bytes }));
        })
        .catch(() => {});
    }
  }, [files]);

  // Live per-file status while a batch runs (event is global to the app).
  // The payload's `file` is the full path — statuses are keyed by it, the
  // same key the render below reads.
  useEffect(() => {
    const unlisten = listen<BatchProgress>("batch-progress", (event) => {
      const { file, status: next } = event.payload;
      setStatus((prev) => ({ ...prev, [file]: next }));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Drop stale statuses whenever the queue itself changes (full-path keys).
  useEffect(() => {
    setStatus((prev) => {
      const next: Record<string, string> = {};
      for (const file of files) {
        if (prev[file]) next[file] = prev[file];
      }
      return next;
    });
  }, [files]);

  if (files.length === 0) return null;
  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t("common.files", { count: files.length })}</h2>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={onClear}>
          Remove all
        </button>
      </div>
      <div className="queue">
        {files.map((file, index) => {
          const name = baseName(file);
          const state = status[file];
          const key = `${file}-${index}`;
          return (
            <div
              className="queue-item"
              key={key}
              data-status={state}
            >
              <button
                className="q-remove"
                title={t("common.remove")}
                onClick={() => onRemove(index)}
              >
                <X />
              </button>
              {broken[key] ? (
                <div className="q-thumb q-thumb-placeholder">
                  <FileImage />
                </div>
              ) : (
                <img
                  src={convertFileSrc(file)}
                  alt={name}
                  loading="lazy"
                  onError={() => markBroken(key)}
                />
              )}
              {state && (
                <span className="q-status">
                  {state === "ok" ? (
                    <Check />
                  ) : state === "failed" ? (
                    <X />
                  ) : (
                    <Loader />
                  )}
                </span>
              )}
              <div className="q-name" title={file}>
                {name}
              </div>
              {sizes[file] !== undefined && (
                <div className="q-size">{formatBytes(sizes[file])}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
