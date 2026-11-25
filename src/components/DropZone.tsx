import { useEffect, useId, useRef, useState, type Ref } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { ImagePlus } from "lucide-react";
import { ACCEPTED_EXTENSIONS, imageExtension, KNOWN_UNSUPPORTED_EXTENSIONS } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  buttonRef?: Ref<HTMLButtonElement>;
  onFiles: (paths: string[]) => void;
  label?: string;
  multiple?: boolean;
  presentation?: "canvas" | "compact" | "button";
  accept?: string[];
  hint?: string;
  onUnsupported?: (paths: string[]) => void;
  onBlockedInput?: (paths: string[], accepted: string[]) => void;
}

function isImagePath(path: string): boolean {
  const extension = imageExtension(path);
  return ACCEPTED_EXTENSIONS.includes(extension) || KNOWN_UNSUPPORTED_EXTENSIONS.includes(extension);
}

function importPaths(paths: string[], handlers: {
  accepted: string[];
  multiple: boolean;
  onFiles: Props["onFiles"];
  onUnsupported: Props["onUnsupported"];
  onBlockedInput: Props["onBlockedInput"];
}) {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const blocked: string[] = [];
  for (const path of paths) {
    const extension = imageExtension(path);
    if (handlers.accepted.includes(extension)) accepted.push(path);
    else if (ACCEPTED_EXTENSIONS.includes(extension)) rejected.push(path);
    else if (KNOWN_UNSUPPORTED_EXTENSIONS.includes(extension)) blocked.push(path);
  }
  if (accepted.length) handlers.onFiles(handlers.multiple ? accepted : accepted.slice(0, 1));
  if (rejected.length) handlers.onUnsupported?.(rejected);
  if (blocked.length) handlers.onBlockedInput?.(blocked, accepted);
}

export default function DropZone({
  buttonRef,
  onFiles,
  label,
  multiple = true,
  presentation = "compact",
  accept,
  hint,
  onUnsupported,
  onBlockedInput,
}: Props) {
  const { t } = useTranslation();
  const hintId = useId();
  const [active, setActive] = useState(false);
  const accepted = accept ?? ACCEPTED_EXTENSIONS;
  const handlers = useRef({ onFiles, onUnsupported, onBlockedInput, multiple, accepted });
  handlers.current = { onFiles, onUnsupported, onBlockedInput, multiple, accepted };

  // A desktop drop can arrive anywhere in the work area. Keep the native
  // subscription stable while the destination and accepted formats change.
  useEffect(() => {
    let mounted = true;
    const unlisten = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (!mounted) return;
      const current = handlers.current;
      if (payload.type === "enter") {
        setActive(payload.paths.some(isImagePath));
      } else if (payload.type === "leave") {
        setActive(false);
      } else if (payload.type === "drop") {
        setActive(false);
        importPaths(payload.paths, current);
      }
    });
    return () => {
      mounted = false;
      void unlisten.then((stop) => stop()).catch(() => {});
    };
  }, []);

  const pick = async () => {
    const picked = await open({ multiple, filters: [{ name: "Images", extensions: accepted }] });
    if (!picked) return;
    importPaths(Array.isArray(picked) ? picked : [picked], handlers.current);
  };

  const name = label ?? t("common.dropHere");
  const isTouch = window.matchMedia?.("(pointer: coarse)").matches;

  if (presentation === "button") {
    return (
      <button type="button" ref={buttonRef} className={`btn btn-sm add-images${active ? " active" : ""}`} onClick={pick}>
        <ImagePlus aria-hidden="true" />
        {name}
      </button>
    );
  }

  return (
    <button
      type="button"
      ref={buttonRef}
      className={`dropzone ${presentation}${active ? " active" : ""}`}
      onClick={pick}
      aria-label={name}
      aria-describedby={hintId}
    >
      <span className="dz-icon"><ImagePlus aria-hidden="true" /></span>
      <span className="dz-main">{name}</span>
      <span className="dz-sub" id={hintId}>
        {hint ?? t(isTouch ? "common.tapBrowseHint" : "common.browseHint")}
      </span>
    </button>
  );
}
