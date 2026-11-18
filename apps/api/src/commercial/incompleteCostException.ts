import { readIncompleteCostReason } from "@workos-final/domain";
import { can, type ApiContext } from "../cloud/context.js";

/**
 * AUD-PRICING-002 · the Owner exception sent with an acceptance, for product and assembly quotes:
 * `incompleteCostAcceptance: { confirm: true, reason }`. The actor is the authenticated session,
 * never a value from the body. The domain decides whether the exception is needed and valid.
 */
export type IncompleteCostExceptionInput = { acceptedByUserId: string; reason: string };

export const INCOMPLETE_COST_EXCEPTION_FORBIDDEN_REASON =
  "Doar Proprietarul poate accepta o ofertă cu cost intern incomplet.";

export function incompleteCostExceptionFromBody(
  c: ApiContext,
  body: unknown,
): IncompleteCostExceptionInput | null | "forbidden" {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw = record?.incompleteCostAcceptance;
  if (!raw || typeof raw !== "object" || (raw as Record<string, unknown>).confirm !== true) return null;
  if (!can(c, "quotes.accept.incomplete_cost")) return "forbidden";
  const acceptedByUserId = c.get("cloudUser")?.userId ?? "local";
  return { acceptedByUserId, reason: readIncompleteCostReason((raw as Record<string, unknown>).reason) ?? "" };
}
