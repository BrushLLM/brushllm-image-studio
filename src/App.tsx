import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ChevronLeft, ChevronRight, Search, Settings as SettingsIcon } from "lucide-react";
import brushLogo from "./assets/brush.svg";
import CommandPalette from "./components/CommandPalette";
import ErrorBoundary from "./components/ErrorBoundary";
import Home, { type Page } from "./pages/Home";
import { lazy, Suspense } from "react";

// Tool pages load on demand — the first paint only ships Home + shell.
const AiRepaint = lazy(() => import("./pages/AiRepaint"));
const Compress = lazy(() => import("./pages/Compress"));
const Convert = lazy(() => import("./pages/Convert"));
const CropRotate = lazy(() => import("./pages/CropRotate"));
const Exif = lazy(() => import("./pages/Exif"));
const ImageAnnotate = lazy(() => import("./pages/ImageAnnotate"));
const ColorPicker = lazy(() => import("./pages/ColorPicker"));
const Adjust = lazy(() => import("./pages/Adjust"));
const Mirror = lazy(() => import("./pages/Mirror"));
const Mosaic = lazy(() => import("./pages/Mosaic"));
const ShadowPage = lazy(() => import("./pages/Shadow"));
const ColorReplace = lazy(() => import("./pages/ColorReplace"));
const RoundedCorners = lazy(() => import("./pages/RoundedCorners"));
const Resize = lazy(() => import("./pages/Resize"));
const Settings = lazy(() => import("./pages/Settings"));
const Stitch = lazy(() => import("./pages/Stitch"));
const Watermark = lazy(() => import("./pages/Watermark"));
import { getSettings } from "./lib/ipc";
import { silentUpdateCheck } from "./lib/update";
import {
  ACCEPTED_EXTENSIONS,
  blockedInputError,
  KNOWN_UNSUPPORTED_EXTENSIONS,
} from "./lib/types";
import { setAppearance, type Appearance } from "./lib/theme";
import { useTranslation } from "react-i18next";
import "./styles.css";

interface Location {
  page: Page;
  tool: string | null;
  /** Files dropped on the home grid, routed to the Convert tool. */
  files: string[] | null;
  /** Notice routed from the home grid (e.g. unsupported-format drop). */
  notice: string | null;
}

const PAGE_TITLE_KEYS: Record<Page, string> = {
  home: "common.tools",
  convert: "convert.title",
  resize: "resize.title",
  compress: "compress.title",
  crop: "crop.title",
  stitch: "stitch.title",
  watermark: "watermark.title",
  exif: "exif.title",
  rounded: "rounded.title",
  picker: "picker.title",
  annotate: "annotate.title",
  mirror: "mirror.title",
  adjust: "adjust.title",
  mosaic: "mosaic.title",
  shadow: "shadow.title",
  colorreplace: "recolor.title",
  repaint: "ai.title",
  settings: "settings.title",
};

export default function App() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<Location>({
    page: "home",
    tool: null,
    files: null,
    notice: null,
  });
  const backStack = useRef<Location[]>([]);
  const forwardStack = useRef<Location[]>([]);
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

  // Apply the saved theme preference once IPC is available.
  useEffect(() => {
    getSettings()
      .then((settings) => {
        const appearance = settings.appearance as Appearance;
        if (appearance === "light" || appearance === "dark" || appearance === "system") {
          setAppearance(appearance);
        }
      })
      .catch(() => {});
    // Silent update probe — persists a banner state for Home when a newer
    // release exists; failures (private repo, offline) stay invisible.
    silentUpdateCheck();
  }, []);

  const navigate = (next: Page, tool?: string, files?: string[], notice?: string) => {
    backStack.current.push(location);
    forwardStack.current = [];
    setLocation({
      page: next,
      tool: next === "repaint" && tool ? tool : null,
      files: next === "convert" ? (files ?? null) : null,
      notice: next === "convert" ? (notice ?? null) : null,
    });
  };

  // Drop images anywhere on the home grid → open them in Convert Format
  // (the one tool that accepts every supported format). Unsupported image
  // formats (AVIF/HEIC/JXL) route there too, with an explanatory notice.
  useEffect(() => {
    if (location.page !== "home") return;
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type !== "drop") return;
      const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
      const paths = payload.paths.filter((p) =>
        ACCEPTED_EXTENSIONS.includes(ext(p)),
      );
      const blocked = payload.paths.filter((p) =>
        KNOWN_UNSUPPORTED_EXTENSIONS.includes(ext(p)),
      );
      if (paths.length > 0) {
        navigate("convert", undefined, paths);
      } else if (blocked.length > 0) {
        navigate("convert", undefined, undefined, blockedInputError(blocked));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.page]);

  // Going "home" is a jump, not history — it must not push the current
  // tool onto the back stack (back/forward stay real navigation).
  const goHome = () => {
    forwardStack.current = [];
    setLocation({ page: "home", tool: null, files: null, notice: null });
  };

  const [cmdkOpen, setCmdkOpen] = useState(false);
  const openCmdk = () => setCmdkOpen(true);

  const goBack = () => {
    const previous = backStack.current.pop();
    if (!previous) return;
    forwardStack.current.push(location);
    setLocation(previous);
  };

  const goForward = () => {
    const next = forwardStack.current.pop();
    if (!next) return;
    backStack.current.push(location);
    setLocation(next);
  };

  const canGoBack = backStack.current.length > 0;
  const canGoForward = forwardStack.current.length > 0;

  // Mouse side buttons (back/forward) and common keyboard shortcuts.
  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        goBack();
      } else if (event.button === 4) {
        event.preventDefault();
        goForward();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const isBack =
        (event.altKey && event.key === "ArrowLeft") ||
        (event.metaKey && event.key === "[");
      const isForward =
        (event.altKey && event.key === "ArrowRight") ||
        (event.metaKey && event.key === "]");
      if (isBack) {
        event.preventDefault();
        goBack();
      } else if (isForward) {
        event.preventDefault();
        goForward();
      } else if (event.key === "Escape") {
        // Escape returns to the tool grid — unless the user is typing.
        const target = event.target as HTMLElement | null;
        const editing =
          target !== null &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (!editing && location.page !== "home") {
          event.preventDefault();
          goHome();
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCmdkOpen((open) => !open);
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
    // Re-register each navigation so the handlers capture fresh state.
  }, [location]);

  return (
    <div className={`shell${isMac ? " mac" : ""}`}>
      <header className="topbar" data-tauri-drag-region>
        <div className="logo-mark">
          <img src={brushLogo} alt="BrushLLM Studio" draggable={false} />
        </div>
        <div className="brand">
          BrushLLM<span className="brand-sub">Image Studio</span>
        </div>
        {location.page !== "home" && (
          <nav className="crumbs" aria-label="breadcrumb">
            <button className="crumb-link" onClick={goHome}>
              {t("common.tools")}
            </button>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">
              {t(PAGE_TITLE_KEYS[location.page])}
              {location.page === "repaint" && location.tool
                ? ` · ${location.tool.replace(/-/g, " ")}`
                : ""}
            </span>
          </nav>
        )}
        <div className="topbar-spacer" />
        <button
          className="btn btn-sm"
          onClick={openCmdk}
          title={t("cmdk.searchTitle")}
        >
          <Search />
        </button>
        <button
          className="btn btn-sm"
          onClick={goBack}
          disabled={!canGoBack}
          title={t("common.back")}
        >
          <ChevronLeft />
        </button>
        <button
          className="btn btn-sm"
          onClick={goForward}
          disabled={!canGoForward}
          title={t("common.forward")}
        >
          <ChevronRight />
        </button>
        <button
          className={`btn btn-sm${location.page === "settings" ? " btn-primary" : ""}`}
          onClick={() => navigate("settings")}
          title={t("common.settings")}
        >
          <SettingsIcon />
        </button>
      </header>
      <main className="content">
        <Suspense fallback={<div className="page" style={{ paddingTop: 80, textAlign: "center", color: "#8a8580" }}>…</div>}>
        <ErrorBoundary>
          {location.page === "home" && <Home onNavigate={navigate} />}
        {location.page === "convert" && (
          <Convert
            onBack={goHome}
            initialFiles={location.files}
            initialNotice={location.notice}
          />
        )}
        {location.page === "resize" && <Resize onBack={goHome} />}
        {location.page === "compress" && <Compress onBack={goHome} />}
        {location.page === "crop" && <CropRotate onBack={goHome} />}
        {location.page === "stitch" && <Stitch onBack={goHome} />}
        {location.page === "watermark" && <Watermark onBack={goHome} />}
        {location.page === "exif" && <Exif onBack={goHome} />}
        {location.page === "rounded" && <RoundedCorners onBack={goHome} />}
        {location.page === "picker" && <ColorPicker onBack={goHome} />}
        {location.page === "annotate" && <ImageAnnotate onBack={goHome} />}
        {location.page === "mirror" && <Mirror onBack={goHome} />}
        {location.page === "adjust" && <Adjust onBack={goHome} />}
        {location.page === "mosaic" && <Mosaic onBack={goHome} />}
        {location.page === "shadow" && <ShadowPage onBack={goHome} />}
        {location.page === "colorreplace" && <ColorReplace onBack={goHome} />}
        {location.page === "repaint" && (
          <AiRepaint
            key={location.tool ?? "default"}
            onBack={goHome}
            onOpenSettings={() => navigate("settings")}
            initialToolId={location.tool}
          />
        )}
        {location.page === "settings" && <Settings onBack={goHome} />}
        </ErrorBoundary>
        </Suspense>
      </main>
      {cmdkOpen && (
        <CommandPalette onNavigate={navigate} onClose={() => setCmdkOpen(false)} />
      )}
    </div>
  );
}
