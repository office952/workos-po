import { presentQuoteVariantList, type QuoteVariantView } from "../../adapters/quoteVariantAdapter";
import { fetchRequestVariants } from "../../api/quoteVariants";
import { useResource } from "../../data/useResource";

/** Commercial Continuity V2 · resource keys and loaders for the variants and journal of a request. */

export const requestVariantsKey = (requestId: string) => `request-variants:${requestId}`;
export const requestJournalKey = (requestId: string) => `request-journal:${requestId}`;

export async function loadRequestVariants(requestId: string): Promise<QuoteVariantView[]> {
  return presentQuoteVariantList(await fetchRequestVariants(requestId));
}

/** The variants of a request for the signed-in person; a role that may not work on them gets none. */
export function useRequestVariants(requestId: string | null) {
  return useResource(requestId ? requestVariantsKey(requestId) : null, () => loadRequestVariants(requestId as string));
}
