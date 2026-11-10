import type { MouseEvent, ReactNode } from "react";
import { catalogSelectionHref, type CatalogSelection } from "./catalogSelection";

type CatalogLinkProps = {
  selection: CatalogSelection;
  onNavigate: (selection: CatalogSelection) => void;
  className?: string;
  current?: boolean;
  label?: string;
  children: ReactNode;
};

/** A real link to a catalog address. A plain click stays in the page; modified clicks keep browser behaviour. */
export function CatalogLink({ selection, onNavigate, className, current = false, label, children }: CatalogLinkProps) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(selection);
  }
  return (
    <a
      className={className}
      href={catalogSelectionHref(selection)}
      aria-current={current ? "page" : undefined}
      aria-label={label}
      onClick={follow}
    >
      {children}
    </a>
  );
}
