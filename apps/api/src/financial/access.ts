import {
  resolveFinancialAccess,
  scopeRequestDetailProjection,
  type FinancialAccessScope,
  type FinancialEndpointFamily,
  type RequestDetailProjection,
} from "@workos-final/domain";
import { isOwner, type ApiContext, organizationRole } from "../cloud/context.js";

export function financialAccess(
  c: ApiContext,
  family: FinancialEndpointFamily,
): FinancialAccessScope {
  return resolveFinancialAccess({
    family,
    isOwner: isOwner(c),
    role: organizationRole(c),
  });
}

export function scopedRequestDetail(
  detail: RequestDetailProjection | null,
  access: FinancialAccessScope,
  /** The actor holds `requests.outcome.manage` (same check as the decision routes). */
  mayDecideOutcome = false,
): RequestDetailProjection | null {
  if (!detail) {
    return null;
  }
  return scopeRequestDetailProjection(detail, access, mayDecideOutcome);
}
