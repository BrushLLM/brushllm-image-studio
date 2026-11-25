import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { forgetBatchFiles } from "../lib/batchState";
import type { LocalToolId } from "../lib/tools";
import DropZone from "./DropZone";
import FileQueue from "./FileQueue";

interface Props {
  tool: LocalToolId;
  files: string[];
  onAdd: (paths: string[]) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  previewFile: string | null;
  onSelectPreview: (file: string) => void;
  onBlockedInput?: (paths: string[]) => void;
  label: string;
  children: ReactNode;
}

export default function BatchInput({
  tool, files, onAdd, onRemove, onClear, previewFile, onSelectPreview, onBlockedInput, label, children,
}: Props) {
  const { t } = useTranslation();
  const importButton = useRef<HTMLButtonElement>(null);
  const hasFiles = files.length > 0;

  return (
    <div className="workbench-main">
      {hasFiles && children}
      <div className={hasFiles ? "card queue-card" : undefined}>
        <div className={hasFiles ? "queue-heading" : undefined}>
          {hasFiles && <h2><span role="status">{t("common.files", { count: files.length })}</span></h2>}
          <div className={hasFiles ? "queue-actions" : undefined}>
            {hasFiles && (
              <button type="button" className="btn btn-sm" onClick={() => {
                importButton.current?.focus();
                forgetBatchFiles(tool, files);
                onClear();
              }}>
                {t("common.removeAll")}
              </button>
            )}
            <DropZone
              buttonRef={importButton}
              presentation={hasFiles ? "button" : "canvas"}
              label={hasFiles ? t("common.addImages") : label}
              onFiles={onAdd}
              onBlockedInput={onBlockedInput}
            />
          </div>
        </div>
        {hasFiles && (
          <FileQueue
            tool={tool}
            files={files}
            onRemove={(index) => {
              if (files.length === 1) importButton.current?.focus();
              onRemove(index);
            }}
            previewFile={previewFile}
            onSelectPreview={onSelectPreview}
          />
        )}
      </div>
    </div>
  );
}
