import type { ReactNode } from "react";
import type { WorklistVariant } from "./Worklist";

type WorklistRowProps = {
  variant?: WorklistVariant;
  href?: string;
  detailHref?: string;
  current?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  identity: string;
  identityDetail?: string;
  context?: string;
  support?: string;
  state?: ReactNode;
  meta?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  actionCommand?: () => void;
  actionPending?: boolean;
};

export function WorklistRow({
  variant = "commercial",
  href,
  detailHref,
  current = false,
  selected = false,
  onSelect,
  identity,
  identityDetail,
  context,
  support,
  state,
  meta,
  actionLabel,
  actionHref,
  actionCommand,
  actionPending = false,
}: WorklistRowProps) {
  const compact = variant === "compact";
  const registry = variant === "registry";
  const split = Boolean(detailHref && (actionHref || actionCommand));
  const interactive = Boolean(href || onSelect || split);
  const identityContent = (
    <>
      <span className="worklist-row__title">{identity}</span>
      {identityDetail ? <span className="worklist-row__detail">{identityDetail}</span> : null}
    </>
  );

  const actionContent = actionLabel ?? "";
  const actionControl = split && actionHref ? (
    <a className="worklist-row__next" href={actionHref}>
      {actionContent}
    </a>
  ) : split && actionCommand ? (
    <button
      type="button"
      className="worklist-row__next"
      disabled={actionPending}
      onClick={actionCommand}
    >
      {actionContent}
    </button>
  ) : (
    actionContent
  );

  const content = (
    <>
      <span className="worklist-row__identity">
        {split && detailHref ? (
          <a
            className="worklist-row__object"
            href={detailHref}
            aria-current={current ? true : undefined}
          >
            {identityContent}
          </a>
        ) : (
          identityContent
        )}
      </span>
      <span className="worklist-row__context">{context ?? ""}</span>
      {registry ? <span className="worklist-row__support">{support ?? ""}</span> : null}
      {compact ? null : <span className="worklist-row__state">{state}</span>}
      {registry ? <span className="worklist-row__meta">{meta ?? ""}</span> : null}
      <span className="worklist-row__action">{actionControl}</span>
    </>
  );

  const className = [
    "worklist-row",
    `worklist-row--${variant}`,
    split ? "worklist-row--split" : null,
    interactive ? null : "worklist-row--static",
  ]
    .filter(Boolean)
    .join(" ");

  if (split) {
    return <div className={className}>{content}</div>;
  }

  if (href) {
    return (
      <a className={className} href={href} aria-current={current ? true : undefined}>
        {content}
      </a>
    );
  }

  if (onSelect) {
    return (
      <button type="button" className={className} aria-pressed={selected} onClick={onSelect}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
