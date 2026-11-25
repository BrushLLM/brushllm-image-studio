import { useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir } from "../lib/ipc";
import type { BatchJob, Collision } from "../lib/types";

interface Props {
  value: BatchJob["output"];
  onChange: Dispatch<SetStateAction<BatchJob["output"]>>;
  defaultSuffix?: string;
}

export default function OutputPanel({ value, onChange, defaultSuffix = "" }: Props) {
  const { t } = useTranslation();
  const suffixId = useId();
  const collisionId = useId();
  const directoryRequest = useRef(0);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const changeDirectory = async (source: "choose" | "default") => {
    const request = ++directoryRequest.current;
    setDirectoryError(null);
    try {
      const dir = source === "choose"
        ? await open({ directory: true, multiple: false })
        : await loadDefaultOutputDir();
      if (request === directoryRequest.current && typeof dir === "string") {
        onChange((current) => ({ ...current, dir }));
      }
    } catch (error) {
      if (request === directoryRequest.current) setDirectoryError(String(error));
    }
  };

  return (
    <>
      <div className="field">
        <label>{t("convert.outputFolder")}</label>
        <div className="path-row output-path-row">
          <div className="path-display" title={value.dir ?? ""}>
            <FolderOpen aria-hidden="true" />
            <span>{value.dir ?? "—"}</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => changeDirectory("choose")}>
            {t("settings.changeFolder")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => changeDirectory("default")}>
            {t("settings.resetToDefault")}
          </button>
        </div>
        {directoryError && <p className="status-note text-danger" role="alert">{directoryError}</p>}
      </div>
      <div className="field">
        <label htmlFor={suffixId}>{t("convert.suffix")}</label>
        <input
          id={suffixId}
          type="text"
          value={value.suffix}
          placeholder={defaultSuffix || "e.g. -converted"}
          onChange={(e) => {
            const suffix = e.target.value;
            onChange((current) => ({ ...current, suffix }));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={collisionId}>{t("convert.collision")}</label>
        <select
          id={collisionId}
          value={value.collision}
          onChange={(e) => {
            const collision = e.target.value as Collision;
            onChange((current) => ({ ...current, collision }));
          }}
        >
          <option value="rename">{t("convert.collisionRename")}</option>
          <option value="skip">{t("convert.collisionSkip")}</option>
          <option value="overwrite">{t("convert.collisionOverwrite")}</option>
        </select>
      </div>
    </>
  );
}
