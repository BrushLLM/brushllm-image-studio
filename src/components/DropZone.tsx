import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { ImagePlus } from "lucide-react";
import { ACCEPTED_EXTENSIONS, KNOWN_UNSUPPORTED_EXTENSIONS } from "../lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  onFiles: (paths: string[]) => void;
  label?: string;
  multiple?: boolean;
  /** Hero-sized empty state (before any files arrive). */
  hero?: boolean;
  /** Extensions this tool accepts; defaults to every supported format. */
  accept?: string[];
  /** Overrides the "or click to browse" formats line. */
  hint?: string;
  /** Called when dropped files are images this tool cannot take. */
  onUnsupported?: (paths: string[]) => void;
  /** Called when dropped files are formats the whole app cannot decode
   *  (AVIF, HEIC, HEIF, JXL). */
  onBlockedInput?: (paths: string[]) => void;
}

function ext(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export default function DropZone({
  onFiles,
  label,
  multiple = true,
  hero = false,
  accept,
  hint,
  onUnsupported,
  onBlockedInput,
}: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const dragDepth = useRef(0);
  const accepted = accept ?? ACCEPTED_EXTENSIONS;

  // The native drag-drop listener is registered ONCE; callbacks arrive via
  // refs so re-renders (language switch, parent state) can never tear the
  // subscription and silently kill drag & drop.
  const handlers = useRef({ onFiles, onUnsupported, onBlockedInput });
  handlers.current = { onFiles, onUnsupported, onBlockedInput };
  const options = useRef({ multiple, accepted });
  options.current = { multiple, accepted };

  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent((event) => {
      const payload = event.payload;
      const { multiple: isMulti } = options.current;
      const isAccepted = (path: string) =>
        options.current.accepted.includes(ext(path));
      const isKnownImage = (path: string) =>
        ACCEPTED_EXTENSIONS.includes(ext(path)) ||
        KNOWN_UNSUPPORTED_EXTENSIONS.includes(ext(path));
      if (payload.type === "enter") {
        if (payload.paths.some(isKnownImage)) {
          setActive(true);
        }
      } else if (payload.type === "over") {
        // stay highlighted while hovering
      } else if (payload.type === "leave") {
        dragDepth.current = 0;
        setActive(false);
      } else if (payload.type === "drop") {
        dragDepth.current = 0;
        setActive(false);
        const ok = payload.paths.filter(isAccepted);
        const rejected = payload.paths.filter(
          (p) => !isAccepted(p) && ACCEPTED_EXTENSIONS.includes(ext(p)),
        );
        const blocked = payload.paths.filter((p) =>
          KNOWN_UNSUPPORTED_EXTENSIONS.includes(ext(p)),
        );
        if (ok.length > 0) {
          handlers.current.onFiles(isMulti ? ok : [ok[0]]);
        }
        if (rejected.length > 0) {
          handlers.current.onUnsupported?.(rejected);
        }
        if (blocked.length > 0) {
          handlers.current.onBlockedInput?.(blocked);
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const pick = async () => {
    const selected = await open({
      multiple,
      filters: [{ name: "Images", extensions: accepted }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length > 0) onFiles(multiple ? paths : [paths[0]]);
  };

  // Touch devices have no drag & drop — the copy says "tap" instead.
  const isTouch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches;

  return (
    <div
      className={`dropzone${active ? " active" : ""}${hero ? " hero" : ""}`}
      onClick={pick}
      role="button"
      tabIndex={0}
      aria-label={label ?? t("common.dropHere")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
    >
      <div className="dz-icon">
        <ImagePlus />
      </div>
      <div className="dz-main">{label ?? t("common.dropHere")}</div>
      <div className="dz-sub">
        {hint ?? (isTouch ? t("common.tapBrowseHint") : t("common.browseHint"))}
      </div>
    </div>
  );
}
