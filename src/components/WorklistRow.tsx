import type { ReactNode } from "react";
import type { WorklistVariant } from "./Worklist";

type WorklistRowProps = {
  variant?: WorklistVariant;
  href?: string;
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
};

export function WorklistRow({
  variant = "commercial",
  href,
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
}: WorklistRowProps) {
  const compact = variant === "compact";
  const registry = variant === "registry";
  const interactive = Boolean(href || onSelect);
  const content = (
    <>
      <span className="worklist-row__identity">
        <span className="worklist-row__title">{identity}</span>
        {identityDetail ? <span className="worklist-row__detail">{identityDetail}</span> : null}
      </span>
      <span className="worklist-row__context">{context ?? ""}</span>
      {registry ? <span className="worklist-row__support">{support ?? ""}</span> : null}
      {compact ? null : <span className="worklist-row__state">{state}</span>}
      {registry ? <span className="worklist-row__meta">{meta ?? ""}</span> : null}
      <span className="worklist-row__action">{actionLabel ?? ""}</span>
    </>
  );

  const className = [
    "worklist-row",
    `worklist-row--${variant}`,
    interactive ? null : "worklist-row--static",
  ]
    .filter(Boolean)
    .join(" ");

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
