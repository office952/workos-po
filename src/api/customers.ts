import { getJson, postJson } from "./http";

export async function fetchCustomers(): Promise<unknown> {
  return getJson("/api/customers");
}

export async function fetchCustomer(customerId: string): Promise<unknown> {
  return getJson(`/api/customers/${encodeURIComponent(customerId)}`);
}

export async function createCustomer(
  displayName: string,
  profile: { city?: string; notes?: string } = {},
): Promise<unknown> {
  return postJson("/api/customers", {
    displayName,
    ...profile,
  });
}
