import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import CommandPalette from "./components/CommandPalette";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import { getSettings } from "./lib/ipc";
import { readPersisted, writePersisted } from "./lib/persistedState";
import { setAppearance } from "./lib/theme";
import { pageLabelKey, type LocalToolId, type Page } from "./lib/tools";
import { blockedInputError } from "./lib/types";
import { mergeImageFiles } from "./lib/useImageFiles";
import { silentUpdateCheck } from "./lib/update";
import Adjust from "./pages/Adjust";
import ColorPicker from "./pages/ColorPicker";
import ColorReplace from "./pages/ColorReplace";
import Compress from "./pages/Compress";
import Convert from "./pages/Convert";
import CropRotate from "./pages/CropRotate";
import Exif from "./pages/Exif";
import Home from "./pages/Home";
import ImageAnnotate from "./pages/ImageAnnotate";
import Mirror from "./pages/Mirror";
import Mosaic from "./pages/Mosaic";
import Resize from "./pages/Resize";
import RoundedCorners from "./pages/RoundedCorners";
import Settings from "./pages/Settings";
import Shadow from "./pages/Shadow";
import Stitch from "./pages/Stitch";
import Watermark from "./pages/Watermark";
import "./styles.css";
import "./studio.css";

const LOCAL_PAGES = {
  adjust: Adjust,
  annotate: ImageAnnotate,
  colorreplace: ColorReplace,
  compress: Compress,
  convert: Convert,
  crop: CropRotate,
  exif: Exif,
  mirror: Mirror,
  mosaic: Mosaic,
  picker: ColorPicker,
  resize: Resize,
  rounded: RoundedCorners,
  shadow: Shadow,
  stitch: Stitch,
  watermark: Watermark,
} satisfies Record<LocalToolId, ComponentType>;

const COMPACT_WINDOW = "(max-width: 960px)";

interface History {
  page: Page;
  back: Page[];
  forward: Page[];
}

export default function App() {
  const { t } = useTranslation();
  const [{ page, back, forward }, setHistory] = useState<History>({
    page: "home",
    back: [],
    forward: [],
  });
  const [expanded, setExpanded] = useState(() => !window.matchMedia(COMPACT_WINDOW).matches);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const lastPage = useRef(page);
  const isMac = /Mac/.test(navigator.userAgent);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_WINDOW);
    const onResize = (event: MediaQueryListEvent) => {
      if (event.matches && document.activeElement?.closest(".nav-group-tools")) {
        sidebarToggle.current?.focus();
      }
      setExpanded(!event.matches);
    };
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);

  useEffect(() => {
    getSettings()
      .then(({ appearance }) => {
        if (appearance === "light" || appearance === "dark" || appearance === "system") {
          setAppearance(appearance);
        }
      })
      .catch(() => {});
    void silentUpdateCheck();
  }, []);

  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;
    if (workspace.current) {
      workspace.current.scrollTop = 0;
      workspace.current.focus({ preventScroll: true });
    }
  }, [page]);

  const navigate = useCallback((next: Page) => {
    setHistory((history) => {
      if (next === history.page) return history;
      let back = history.back;
      if (next !== "home") back = [...back, history.page];
      else if (back[back.length - 1] === "home") back = back.slice(0, -1);
      return { page: next, back, forward: [] };
    });
  }, []);

  const goBack = useCallback(() => {
    setHistory((history) => {
      const previous = history.back[history.back.length - 1];
      if (!previous) return history;
      return { page: previous, back: history.back.slice(0, -1), forward: [...history.forward, history.page] };
    });
  }, []);

  const goForward = useCallback(() => {
    setHistory((history) => {
      const next = history.forward[history.forward.length - 1];
      if (!next) return history;
      return { page: next, back: [...history.back, history.page], forward: history.forward.slice(0, -1) };
    });
  }, []);

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (cmdkOpen) return;
      if (event.button === 3) {
        event.preventDefault();
        goBack();
      } else if (event.button === 4) {
        event.preventDefault();
        goForward();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCmdkOpen((open) => !open);
      } else if (!cmdkOpen) {
        if ((event.altKey && event.key === "ArrowLeft") || (event.metaKey && event.key === "[")) {
          event.preventDefault();
          goBack();
        } else if ((event.altKey && event.key === "ArrowRight") || (event.metaKey && event.key === "]")) {
          event.preventDefault();
          goForward();
        } else if (event.key === "Escape" && page !== "home") {
          const target = event.target;
          if (target instanceof HTMLElement &&
              (target.isContentEditable || target.matches("input, textarea, select"))) return;
          event.preventDefault();
          navigate("home");
        }
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cmdkOpen, goBack, goForward, navigate, page]);

  const openInConvert = (files: string[], notice: string | null = null) => {
    if (files.length) {
      const queued = readPersisted<string[]>("local.convert.files") ?? [];
      writePersisted("local.convert.files", mergeImageFiles(queued, files));
    }
    writePersisted("local.convert.inputError", notice);
    navigate("convert");
  };

  const pageContent = () => {
    if (page === "home") {
      return (
        <Home
          onNavigate={navigate}
          onImport={openInConvert}
          onBlocked={(files) => openInConvert([], blockedInputError(files))}
        />
      );
    }
    if (page === "settings") return <Settings />;
    const LocalPage = LOCAL_PAGES[page];
    return <LocalPage />;
  };

  const toggleLabel = t(expanded ? "navigation.collapse" : "navigation.expand");
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <div className={`studio-shell${isMac ? " mac" : ""}${expanded ? "" : " sidebar-collapsed"}`}>
      <a className="skip-workspace" href="#workspace">{t("navigation.skip")}</a>
      <header className="window-toolbar" data-tauri-drag-region>
        <button type="button" className="window-button" ref={sidebarToggle} title={toggleLabel} aria-label={toggleLabel}
          aria-controls="studio-navigation" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          <ToggleIcon aria-hidden="true" />
        </button>
        <div className="window-history">
          <button type="button" className="window-button" title={t("common.back")} aria-label={t("common.back")}
            onClick={goBack} disabled={!back.length}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="window-button" title={t("common.forward")} aria-label={t("common.forward")}
            onClick={goForward} disabled={!forward.length}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="window-drag-space" data-tauri-drag-region />
        <button type="button" className="window-button window-search" aria-label={t("navigation.search")}
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"} onClick={() => setCmdkOpen(true)}>
          <Search aria-hidden="true" />
          <span>{t("navigation.search")}</span>
          <kbd aria-hidden="true">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
        </button>
      </header>
      <Sidebar page={page} expanded={expanded} onExpand={() => setExpanded(true)} onNavigate={navigate} />
      <main className="content" id="workspace" ref={workspace} tabIndex={-1} aria-label={t(pageLabelKey(page))}>
        <ErrorBoundary key={page}>{pageContent()}</ErrorBoundary>
      </main>
      {cmdkOpen && <CommandPalette onNavigate={navigate} onClose={() => setCmdkOpen(false)} />}
    </div>
  );
}
