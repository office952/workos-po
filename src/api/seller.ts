import { getJson, patchJson } from "./http";

export async function fetchSeller(): Promise<unknown> {
  return getJson("/api/seller");
}

export async function updateSeller(input: {
  legalName: string;
  brand?: string;
  fiscalId?: string;
  locality?: string;
}): Promise<unknown> {
  return patchJson("/api/seller", input);
}
