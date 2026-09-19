import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  meta?: string;
  status?: ReactNode;
  action?: ReactNode;
};

function sameOperatorLabel(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("ro-RO") === right.trim().toLocaleLowerCase("ro-RO");
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  meta,
  status,
  action,
}: PageHeaderProps) {
  const showEyebrow = Boolean(eyebrow && !sameOperatorLabel(eyebrow, title));
  const hasAside = status != null || action != null;

  return (
    <div className="page-header">
      <div className="page-header__copy">
        {showEyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header__title">{title}</h1>
        {lead ? <p className="page-header__lead">{lead}</p> : null}
        {meta ? <p className="page-header__meta">{meta}</p> : null}
      </div>
      {hasAside ? (
        <div className="page-header__aside">
          {status ? <div className="page-header__status">{status}</div> : null}
          {action ? <div className="page-header__action">{action}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
