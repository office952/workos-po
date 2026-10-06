import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  /** Visual tone only. Must not change PageHeader geometry. */
  quiet?: boolean;
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
  quiet = false,
}: PageHeaderProps) {
  const showEyebrow = Boolean(eyebrow && !sameOperatorLabel(eyebrow, title));

  return (
    <div
      className={quiet ? "page-header page-header--quiet" : "page-header"}
      data-page-header-contract="fixed"
    >
      <div className="page-header__copy">
        <p className="page-header__eyebrow" data-empty={showEyebrow ? undefined : "true"}>
          {showEyebrow ? eyebrow : null}
        </p>
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__lead" data-empty={lead ? undefined : "true"}>
          {lead ?? null}
        </p>
        <p className="page-header__meta" data-empty={meta == null ? "true" : undefined}>
          {meta ?? null}
        </p>
      </div>
      <div className="page-header__aside" aria-hidden={status == null && action == null ? true : undefined}>
        <div className="page-header__status" data-empty={status == null ? "true" : undefined}>
          {status ?? null}
        </div>
        <div className="page-header__action" data-empty={action == null ? "true" : undefined}>
          {action ?? null}
        </div>
      </div>
    </div>
  );
}
