import type { OfferCommercialStatusTransport } from "../../api/types";

/**
 * What the next decision of this offer does, said once and only while it is still open: before
 * acceptance it explains accepting, after an acceptance without order it explains confirming the
 * order, and once an order exists it only says that production is a separate step.
 */
export type QuoteDecisionMode = "accept" | "confirm-order" | "ordered" | "none";

export function quoteDecisionMode(input: {
  ordered: boolean;
  status: Pick<OfferCommercialStatusTransport, "commercialStatus"> | null;
  nextAction: string | null;
}): QuoteDecisionMode {
  if (input.ordered) return "ordered";
  if (input.status?.commercialStatus === "ACCEPTED_WITHOUT_ORDER") return "confirm-order";
  if (input.nextAction === "ACCEPT_QUOTE" || input.nextAction === "CREATE_ORDER") return "accept";
  return "none";
}
