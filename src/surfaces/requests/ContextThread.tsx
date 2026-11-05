export type ContextThreadItem = {
  label: string;
  href?: string | null;
};

/**
 * The context thread: where the operator is, and the one next step.
 * It does not decide commercial state.
 */
export function ContextThread({
  label,
  items = [],
  summary,
  action,
  jump,
}: {
  label: string;
  items?: readonly ContextThreadItem[];
  summary?: string | null;
  action?: { href: string; label: string } | null;
  jump?: { href: string; label: string } | null;
}) {
  return (
    <nav className="context-thread" aria-label={label}>
      {items.length > 0 ? (
        <ol className="context-thread__trail">
          {items.map((item) => (
            <li key={`${item.href ?? ""}:${item.label}`}>
              {item.href ? <a className="text-link" href={item.href}>{item.label}</a> : <span>{item.label}</span>}
            </li>
          ))}
        </ol>
      ) : null}
      {summary ? (
        <p className="context-thread__summary">
          <span className="context-thread__kicker">Pasul următor</span>
          <span>{summary}</span>
          {action ? <a className="text-link" href={action.href}>{action.label}</a> : null}
        </p>
      ) : null}
      {jump ? <a className="context-thread__jump text-link" href={jump.href}>{jump.label}</a> : null}
    </nav>
  );
}
