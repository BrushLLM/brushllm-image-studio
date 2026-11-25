import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, ArrowRight, Globe, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { AI_TOOLS, LOCAL_TOOL_GROUPS, type Page, type Tool } from "../lib/tools";
import { useUpdateBanner } from "../lib/update";

const LINKS = [
  { url: "https://brushllm.com/", label: "footer.website" },
  { url: "https://brushllm.com/docs", label: "footer.apiDocs" },
] as const;

interface Props {
  onNavigate: (page: Page) => void;
  onImport: (files: string[]) => void;
  onBlocked: (files: string[]) => void;
}

export default function Home({ onNavigate, onImport, onBlocked }: Props) {
  const { t } = useTranslation();
  const { update, dismiss } = useUpdateBanner();

  const renderTools = (tools: readonly Tool[]) => (
    <ul className="directory-list">
      {tools.map((tool) => (
        <li key={tool.id}>
          <button type="button" className="directory-item" onClick={() => onNavigate(tool.id)}>
            <tool.icon aria-hidden="true" />
            <span className="directory-copy">
              <strong>{t(tool.labelKey)}</strong>
              <span>{t(tool.descriptionKey)}</span>
            </span>
            <ArrowRight className="directory-arrow" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <PageShell title={t("navigation.allTools")} subtitle={t("home.workspaceIntro")}>
      {update && (
        <div className="banner banner-info">
          <span className="flex-1">
            {t("home.updateBanner", { version: update.latest })}{" "}
            <button type="button" className="banner-link" onClick={() => onNavigate("settings")}>
              {t("home.updateGoSettings")}
            </button>
          </span>
          <button type="button" className="banner-dismiss" aria-label={t("home.updateDismiss")} onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="home-import">
        <DropZone
          presentation="canvas"
          label={t("home.importLabel")}
          onFiles={onImport}
          onBlockedInput={(blocked, accepted) => { if (!accepted.length) onBlocked(blocked); }}
        />
      </div>
      <div className="tool-directory">
        <section className="directory-group">
          <header className="directory-heading"><h2>{t("home.localSection")}</h2></header>
          {LOCAL_TOOL_GROUPS.map(({ title, tools }) => (
            <div key={title} className="directory-category">
              <h3>{t(title)}</h3>
              {renderTools(tools)}
            </div>
          ))}
        </section>
        <section className="directory-group">
          <header className="directory-heading">
            <h2>{t("navigation.onlineAi")}</h2>
            <p className="badge billing-label"><Globe aria-hidden="true" /> {t("ai.billingShort")}</p>
          </header>
          {renderTools(AI_TOOLS)}
        </section>
      </div>
      <footer className="home-footer">
        {LINKS.map(({ url, label }) => (
          <a key={url} href={url} onClick={(event) => {
            event.preventDefault();
            void openUrl(url);
          }}>
            {t(label)} <ArrowUpRight aria-hidden="true" />
          </a>
        ))}
      </footer>
    </PageShell>
  );
}
