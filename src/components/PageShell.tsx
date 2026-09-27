import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  title: string;
  subtitle: string;
  onBack: () => void;
  badge?: ReactNode;
  children: ReactNode;
}

export default function PageShell({ title, subtitle, onBack, badge, children }: Props) {
  const { t } = useTranslation();
  return (
    <div className="page">
      <button className="back-link" onClick={onBack}>
        {t("common.allTools")}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1>{title}</h1>
        {badge}
      </div>
      <p className="page-sub">{subtitle}</p>
      {children}
    </div>
  );
}
