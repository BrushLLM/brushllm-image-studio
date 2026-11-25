import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, FileImage, Minus, X } from "lucide-react";
import { fileMeta } from "../lib/ipc";
import { forgetBatchFiles, useBatchFileStatuses } from "../lib/batchState";
import type { LocalToolId } from "../lib/tools";
import { formatBytes } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  tool: LocalToolId;
  files: string[];
  onRemove: (index: number) => void;
  previewFile: string | null;
  onSelectPreview: (file: string) => void;
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

export default function FileQueue({ tool, files, onRemove, previewFile, onSelectPreview }: Props) {
  const { t } = useTranslation();
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const statuses = useBatchFileStatuses(tool);
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

  return (
    <div className="queue">
      {files.map((file, index) => {
        const name = baseName(file);
        const state = statuses.get(file);
        const key = file;
        return (
          <div
            className="queue-item"
            key={key}
            data-status={state}
          >
            <button
              type="button"
              ref={(button) => {
                if (button) removeButtons.current.set(file, button);
                else removeButtons.current.delete(file);
              }}
              className="q-remove"
              title={t("common.remove")}
              aria-label={`${t("common.remove")} ${name}`}
              onClick={() => {
                const adjacent = files[index + 1] ?? files[index - 1];
                if (adjacent) removeButtons.current.get(adjacent)?.focus();
                forgetBatchFiles(tool, [file]);
                onRemove(index);
              }}
            >
              <X aria-hidden="true" />
            </button>
            <button
              type="button"
              className="queue-preview"
              aria-label={t("common.previewImage", { name })}
              aria-pressed={file === previewFile}
              onClick={() => onSelectPreview(file)}
            >
              {broken[key] ? (
                <span className="q-thumb q-thumb-placeholder"><FileImage aria-hidden="true" /></span>
              ) : (
                <img src={convertFileSrc(file)} alt="" loading="lazy" onError={() => markBroken(key)} />
              )}
            </button>
            {state && (
              <span className="q-status" aria-hidden="true">
                {state === "ok" ? (
                  <Check />
                ) : state === "failed" ? (
                  <X />
                ) : (
                  <Minus />
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
  );
}
