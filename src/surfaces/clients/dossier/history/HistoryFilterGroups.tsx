import type { ReactNode } from "react";
import type { CustomerHistoryModel } from "../../../../adapters/customerDossierAdapter";
import { countLabel } from "../historyModel";
import type { ListContext } from "../listContext";
import { historyFilterOptions, type FilterField } from "./filterOptions";

const GROUPS: Array<{ field: FilterField; title: string; all: string }> = [
  { field: "year", title: "An", all: "Toți anii" },
  { field: "site", title: "Sediu", all: "Toate sediile" },
  { field: "state", title: "Stare", all: "Toate stările" },
  { field: "provenance", title: "Proveniență", all: "Toate proveniențele" },
];

/**
 * The filters in the sheet (tablet and phone): the same four choices as the desktop menus, each
 * applied at once; "Toate …" clears only its own group. Counts are the server facets.
 */
export function HistoryFilterGroups({ data, context, apply }: { data: CustomerHistoryModel; context: ListContext; apply: (patch: Partial<ListContext>) => void }) {
  const options = historyFilterOptions(data, context);
  const option = (active: boolean, onClick: () => void, children: ReactNode, count: number | null, key: string) => (
    <li key={key}>
      <button type="button" className="dfilter" aria-pressed={active} onClick={onClick} data-empty={count === 0 || undefined}>
        <span className="dfilter__mark" aria-hidden="true" />
        <span className="dfilter__label">{children}</span>
        {count === null ? null : <>{" "}<span className="dfilter__count">{count}</span></>}
      </button>
    </li>
  );
  return (
    <div className="dfilters" data-sheet>
      {GROUPS.filter((group) => options[group.field].length).map((group) => (
        <div key={group.field} className="dfilters__group">
          <p className="dfilters__title">{group.title}</p>
          <ul>
            {option(!context[group.field], () => apply({ [group.field]: "" }), group.all, null, `all-${group.field}`)}
            {options[group.field].map((item) =>
              option(context[group.field] === item.value, () => apply({ [group.field]: context[group.field] === item.value ? "" : item.value }), item.label, item.count, item.value),
            )}
          </ul>
        </div>
      ))}
      <p className="dfilters__note">
        {`Istoric: ${countLabel(data.totals.entries, "intrare", "intrări")} = ${data.totals.projects} în WorkOS + ${data.totals.historicalWorks} înregistrări istorice + ${data.totals.uploads} documente încărcate. Numărul de lângă fiecare filtru ține cont de celelalte filtre active.`}
      </p>
    </div>
  );
}
