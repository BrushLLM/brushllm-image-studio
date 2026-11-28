import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, ArrowRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import DropZone from "../components/DropZone";
import PageShell from "../components/PageShell";
import { LOCAL_TOOL_GROUPS, type Page, type Tool } from "../lib/tools";
import { useUpdateBanner } from "../lib/update";

const PRODUCT_URL = "https://brushllm.com/studio/";

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
      <section>
        <h2 className="directory-heading">{t("home.localSection")}</h2>
        <div className="tool-directory">
          {LOCAL_TOOL_GROUPS.map(({ title, tools }) => (
            <div key={title} className="directory-category">
              <h3>{t(title)}</h3>
              {renderTools(tools)}
            </div>
          ))}
        </div>
      </section>
      <footer className="home-footer">
        <a href={PRODUCT_URL} onClick={(event) => {
          event.preventDefault();
          void openUrl(PRODUCT_URL);
        }}>
          {t("footer.website")} <ArrowUpRight aria-hidden="true" />
        </a>
      </footer>
    </PageShell>
  );
}
