import type { ReactNode } from "react";

export type SurfacePanelVariant =
  | "default"
  | "quiet"
  | "selected"
  | "operational"
  | "flush";

type SurfacePanelProps = {
  variant?: SurfacePanelVariant;
  title?: string;
  label?: string;
  description?: string;
  status?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  busy?: boolean;
  children: ReactNode;
};

function panelHasHeader(
  title?: string,
  description?: string,
  status?: ReactNode,
  meta?: ReactNode,
  action?: ReactNode,
): boolean {
  return Boolean(title || description || status || meta || action);
}

export function SurfacePanel({
  variant = "default",
  title,
  label,
  description,
  status,
  meta,
  action,
  busy = false,
  children,
}: SurfacePanelProps) {
  const showHeader = panelHasHeader(title, description, status, meta, action);
  const showHeading = Boolean(title || description);
  const showAside = Boolean(status || meta || action);
  const headerClass = showHeading
    ? "ui-panel__header"
    : "ui-panel__header ui-panel__header--aside-only";

  return (
    <section
      className={`ui-panel ui-panel--${variant}`}
      aria-label={label ?? title}
      aria-busy={busy || undefined}
    >
      {showHeader ? (
        <div className={headerClass}>
          {showHeading ? (
            <div className="ui-panel__heading">
              {title ? <h2 className="ui-panel__title">{title}</h2> : null}
              {description ? <p className="ui-panel__description">{description}</p> : null}
            </div>
          ) : null}
          {showAside ? (
            <div className="ui-panel__aside">
              {status ? <div className="ui-panel__status">{status}</div> : null}
              {meta ? <div className="ui-panel__meta">{meta}</div> : null}
              {action ? <div className="ui-panel__action">{action}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="ui-panel__body">{children}</div>
    </section>
  );
}
