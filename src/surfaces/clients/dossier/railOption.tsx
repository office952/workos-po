import type { ReactNode } from "react";

/**
 * One option of a rail group (see RailGroup): its label and, when the server or the loaded list gives one, its count.
 * `mark` draws the sheet's round mark (as in Istoric), which is what shows the chosen option in a sheet.
 */
export function railOption(active: boolean, onClick: () => void, label: ReactNode, count: number | null, key: string, mark = false) {
  return (
    <li key={key}>
      <button type="button" className="dfilter" aria-pressed={active} onClick={onClick} data-empty={count === 0 || undefined}>
        {mark ? <span className="dfilter__mark" aria-hidden="true" /> : null}
        <span className="dfilter__label">{label}</span>
        {/* A space keeps the name readable ("2026 4", not "20264"); the layout places the count apart. */}
        {count !== null ? <>{" "}<span className="dfilter__count">{count}</span></> : null}
      </button>
    </li>
  );
}
