import { useEffect, useRef, useState } from "react";
import { ChevronDown, Images, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import studioIcon from "../assets/image-studio.svg";
import { LOCAL_TOOL_GROUPS, SETTINGS_TOOL, type Page, type Tool } from "../lib/tools";

interface Props {
  page: Page;
  expanded: boolean;
  onExpand: () => void;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ page, expanded, onExpand, onNavigate }: Props) {
  const { t } = useTranslation();
  const toolSelected = page !== "home" && page !== "settings";
  const [toolsOpen, setToolsOpen] = useState(true);
  const open = expanded && toolsOpen;
  const activeTool = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (toolSelected) setToolsOpen(true);
  }, [page, toolSelected]);

  useEffect(() => {
    if (open && toolSelected) {
      activeTool.current?.scrollIntoView({ block: "nearest" });
    }
  }, [page, open, toolSelected]);

  const renderTool = (tool: Tool) => (
    <button
      key={tool.id}
      ref={page === tool.id ? activeTool : undefined}
      type="button"
      className="nav-button"
      aria-current={page === tool.id ? "page" : undefined}
      aria-label={t(tool.labelKey)}
      title={t(tool.labelKey)}
      onClick={() => onNavigate(tool.id)}
    >
      <tool.icon aria-hidden="true" />
      <span className="nav-label">{t(tool.labelKey)}</span>
    </button>
  );

  return (
    <nav id="studio-navigation" className="sidebar" aria-label={t("navigation.label")}>
      <div className="sidebar-brand" title="BrushLLM Image Studio">
        <span className="sidebar-mark"><img src={studioIcon} alt="" draggable={false} /></span>
        <span className="nav-label"><strong>BrushLLM</strong><span>Image Studio</span></span>
      </div>
      <div className="sidebar-scroll">
        <button
          type="button"
          className="nav-button"
          aria-label={t("navigation.allTools")}
          title={t("navigation.allTools")}
          aria-current={page === "home" ? "page" : undefined}
          onClick={() => onNavigate("home")}
        >
          <Images aria-hidden="true" />
          <span className="nav-label">{t("navigation.allTools")}</span>
        </button>
        <div className="nav-group">
          <button
            type="button"
            className="nav-button nav-group-button"
            data-current={toolSelected && !open ? true : undefined}
            aria-expanded={open}
            aria-controls="studio-nav-local"
            aria-label={t("cmdk.localSection")}
            title={t("cmdk.localSection")}
            onClick={() => {
              if (!expanded) onExpand();
              setToolsOpen(!open);
            }}
          >
            <Wrench aria-hidden="true" />
            <span className="nav-label">{t("cmdk.localSection")}</span>
            <ChevronDown className="nav-chevron" aria-hidden="true" />
          </button>
          <div id="studio-nav-local" className="nav-group-tools" hidden={!open}>
            {open && LOCAL_TOOL_GROUPS.map(({ title, tools }) => (
              <div key={title}>
                <p className="nav-group-label">{t(title)}</p>
                {tools.map(renderTool)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="sidebar-footer">{renderTool(SETTINGS_TOOL)}</div>
    </nav>
  );
}
