import { useEffect, useRef, useState } from "react";
import { ChevronDown, Images, WandSparkles, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import studioIcon from "../assets/image-studio.svg";
import { AI_TOOLS, LOCAL_TOOL_GROUPS, SETTINGS_TOOL, isAiTool, type Page, type Tool } from "../lib/tools";

const GROUPS = [
  { id: "local", labelKey: "cmdk.localSection", icon: Wrench, sections: LOCAL_TOOL_GROUPS },
  { id: "ai", labelKey: "navigation.onlineAi", icon: WandSparkles, sections: [{ tools: AI_TOOLS }] },
] as const;

type Group = (typeof GROUPS)[number]["id"];

interface Props {
  page: Page;
  expanded: boolean;
  onExpand: () => void;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ page, expanded, onExpand, onNavigate }: Props) {
  const { t } = useTranslation();
  const currentGroup = page === "home" || page === "settings" ? null : isAiTool(page) ? "ai" : "local";
  const [openGroup, setOpenGroup] = useState<Group | null>(currentGroup ?? "local");
  const activeTool = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (currentGroup) setOpenGroup(currentGroup);
  }, [page, currentGroup]);

  useEffect(() => {
    if (expanded && openGroup === currentGroup) {
      activeTool.current?.scrollIntoView({ block: "nearest" });
    }
  }, [page, expanded, currentGroup, openGroup]);

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
        {GROUPS.map(({ id, labelKey, icon: Icon, sections }) => {
          const open = expanded && openGroup === id;
          return (
            <div className="nav-group" key={id}>
              <button
                type="button"
                className="nav-button nav-group-button"
                data-current={currentGroup === id && !open ? true : undefined}
                aria-expanded={open}
                aria-controls={`studio-nav-${id}`}
                aria-label={t(labelKey)}
                title={t(labelKey)}
                onClick={() => {
                  if (!expanded) onExpand();
                  setOpenGroup(open ? null : id);
                }}
              >
                <Icon aria-hidden="true" />
                <span className="nav-label">{t(labelKey)}</span>
                <ChevronDown className="nav-chevron" aria-hidden="true" />
              </button>
              <div id={`studio-nav-${id}`} className="nav-group-tools" hidden={!open}>
                {open && sections.map((section) => (
                  <div key={"title" in section ? section.title : id}>
                    {"title" in section && <p className="nav-group-label">{t(section.title)}</p>}
                    {section.tools.map(renderTool)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">{renderTool(SETTINGS_TOOL)}</div>
    </nav>
  );
}
