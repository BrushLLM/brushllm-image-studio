import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function PageShell({ title, subtitle, children }: Props) {
  return (
    <div className="page">
      <header className="page-heading">
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
