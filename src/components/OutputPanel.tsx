import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { loadDefaultOutputDir } from "../lib/ipc";
import type { Collision } from "../lib/types";

export interface OutputConfig {
  dir: string | null;
  suffix: string;
  collision: Collision;
}

interface Props {
  value: OutputConfig;
  onChange: (value: OutputConfig) => void;
  defaultSuffix?: string;
}

export default function OutputPanel({ value, onChange, defaultSuffix = "" }: Props) {
  const { t } = useTranslation();

  const pickDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      onChange({ ...value, dir });
    }
  };

  // Reset goes back to the app-wide default folder (Settings), not to a
  // "next to the source image" mode — that mode no longer exists.
  const resetDir = async () => {
    const dir = await loadDefaultOutputDir();
    if (dir) onChange({ ...value, dir });
  };

  return (
    <>
      <div className="field">
        <label>{t("convert.outputFolder")}</label>
        <div className="path-row">
          <div className="path-display" title={value.dir ?? ""}>
            <FolderOpen />
            <span>{value.dir ?? "—"}</span>
          </div>
          <button className="btn btn-sm" onClick={pickDir}>
            {t("settings.changeFolder")}
          </button>
          <button className="btn btn-sm" onClick={resetDir}>
            {t("settings.resetToDefault")}
          </button>
        </div>
      </div>
      <div className="field">
        <label>{t("convert.suffix")}</label>
        <input
          type="text"
          value={value.suffix}
          placeholder={defaultSuffix || "e.g. -converted"}
          onChange={(e) => onChange({ ...value, suffix: e.target.value })}
        />
      </div>
      <div className="field">
        <label>{t("convert.collision")}</label>
        <select
          value={value.collision}
          onChange={(e) =>
            onChange({ ...value, collision: e.target.value as Collision })
          }
        >
          <option value="rename">{t("convert.collisionRename")}</option>
          <option value="skip">{t("convert.collisionSkip")}</option>
          <option value="overwrite">{t("convert.collisionOverwrite")}</option>
        </select>
      </div>
    </>
  );
}
