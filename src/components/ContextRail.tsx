type ContextRailItemModel = {
  id: string;
  label: string;
  secondary?: string;
  current?: boolean;
  selected?: boolean;
  href?: string;
  onSelect?: () => void;
};

type ContextRailProps = {
  label: string;
  items: readonly ContextRailItemModel[];
  inert?: boolean;
};

type ContextRailItemProps = Omit<ContextRailItemModel, "id">;

function railItemClassName(
  interactive: boolean,
  marked: boolean,
): string {
  return [
    "context-rail__item",
    interactive ? null : "context-rail__item--static",
    marked ? "context-rail__item--marked" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function ContextRailItem({
  label,
  secondary,
  current = false,
  selected = false,
  href,
  onSelect,
}: ContextRailItemProps) {
  const body = (
    <>
      <span className="context-rail__label">{label}</span>
      {secondary ? <span className="context-rail__secondary">{secondary}</span> : null}
    </>
  );

  if (href) {
    return (
      <a
        className={railItemClassName(true, current || selected)}
        href={href}
        aria-current={current ? true : undefined}
      >
        {body}
      </a>
    );
  }

  if (onSelect) {
    return (
      <button
        type="button"
        className={railItemClassName(true, selected)}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {body}
      </button>
    );
  }

  return <p className={railItemClassName(false, current || selected)}>{body}</p>;
}

export function ContextRail({ label, items, inert = false }: ContextRailProps) {
  return (
    <div className="context-rail" role="group" aria-label={label} inert={inert || undefined}>
      {items.map((item) => (
        <ContextRailItem
          key={item.id}
          label={item.label}
          secondary={item.secondary}
          current={item.current}
          selected={item.selected}
          href={item.href}
          onSelect={item.onSelect}
        />
      ))}
    </div>
  );
}
