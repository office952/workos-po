import {
  resolveFinancialAccess,
  scopeRequestDetailProjection,
  type FinancialAccessScope,
  type FinancialEndpointFamily,
  type RequestDetailProjection,
} from "@workos-final/domain";
import { isOwner, type ApiContext } from "../cloud/context.js";

export function financialAccess(
  c: ApiContext,
  family: FinancialEndpointFamily,
): FinancialAccessScope {
  return resolveFinancialAccess({
    family,
    isOwner: isOwner(c),
  });
}

export function scopedRequestDetail(
  detail: RequestDetailProjection | null,
  access: FinancialAccessScope,
): RequestDetailProjection | null {
  if (!detail) {
    return null;
  }
  return scopeRequestDetailProjection(detail, access);
}
