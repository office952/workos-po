import { customerHistoryQueryString, fetchCustomerHistory } from "../../../api/customerDossier";
import { presentCustomerHistory, type HistoryEntry } from "../../../adapters/customerDossierAdapter";
import { resourceKeys } from "../../../data/resourceKeys";

const PAGE_SIZE = 50;

/** Every history entry of the client for the chosen year and site, in the server's order (newest first). */
export async function loadAllEntries(customerId: string, query: { year?: string; site?: string }): Promise<{ entries: HistoryEntry[]; totalPhotos: number; years: number[]; sites: Array<{ siteId: string; name: string; active: boolean; count: number }> }> {
  const entries: HistoryEntry[] = [];
  let page = 1;
  for (;;) {
    const presented = presentCustomerHistory(await fetchCustomerHistory(customerId, { ...query, page, pageSize: PAGE_SIZE }));
    if (!presented) throw new Error("unpresentable");
    entries.push(...presented.entries);
    if (page >= presented.pageCount) {
      return { entries, totalPhotos: presented.totals.photos, years: presented.facets.years, sites: presented.facets.sites };
    }
    page += 1;
  }
}

/** The cache key of every entry for a year and site (under the history prefix, refreshed with the dossier). */
export function allEntriesKey(customerId: string, query: { year?: string; site?: string }): string {
  return resourceKeys.customerHistory(customerId, `toate${customerHistoryQueryString(query)}`);
}
