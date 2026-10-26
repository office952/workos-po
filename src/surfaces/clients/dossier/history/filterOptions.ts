import type { CustomerHistoryModel } from "../../../../adapters/customerDossierAdapter";
import type { ListContext } from "../listContext";

export type FilterOption = { value: string; label: string; count: number | null };

/** The filter choices, from the server facets only (counts keep the other active filters). */
export function historyFilterOptions(data: CustomerHistoryModel, context: ListContext) {
  return {
    year: data.facets.yearCounts.map((item): FilterOption => ({ value: String(item.year), label: String(item.year), count: item.count })),
    site: data.facets.sites.map((site): FilterOption => ({ value: site.siteId, label: site.active ? site.name : `${site.name} (inactiv)`, count: site.count })),
    state: data.facets.states.filter((item) => item.count > 0 || context.state === item.state).map((item): FilterOption => ({ value: item.state, label: item.label, count: item.count })),
    provenance: data.facets.provenances.map((item): FilterOption => ({ value: item.provenance, label: item.label, count: item.count })),
  };
}

export const FILTER_TITLE = { year: "An", site: "Sediu", state: "Stare", provenance: "Proveniență" } as const;
export const ALL_LABEL = { year: "Toți anii", site: "Toate sediile", state: "Toate stările", provenance: "Toate proveniențele" } as const;

export type FilterField = keyof typeof FILTER_TITLE;

