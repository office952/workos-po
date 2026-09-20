import { getJson, sendJson } from "./http";

export function commercialPolicyPath(): string {
  return "/api/admin/commercial-policy";
}

export async function fetchCommercialPolicy(): Promise<unknown> {
  return getJson(commercialPolicyPath());
}

export async function postCommercialPolicy(body: {
  markupPercent: number;
  vatPercent: number;
  defaultDiscountPercent: number;
  defaultAdjustment: number;
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", commercialPolicyPath(), body);
}
