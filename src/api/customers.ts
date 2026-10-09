import { getJson, postJson } from "./http";

export async function fetchCustomers(): Promise<unknown> {
  return getJson("/api/customers");
}

export async function fetchCustomer(customerId: string): Promise<unknown> {
  return getJson(`/api/customers/${encodeURIComponent(customerId)}`);
}

export async function fetchCustomerWorkspace(customerId: string): Promise<unknown> {
  return getJson(`/api/customers/${encodeURIComponent(customerId)}/workspace`);
}

export async function createCustomer(
  displayName: string,
  profile: { cui?: string; address?: string; city?: string; notes?: string } = {},
): Promise<unknown> {
  return postJson("/api/customers", {
    displayName,
    ...profile,
  });
}

export function lookupCustomerByCui(cui: string): Promise<unknown> {
  return getJson(`/api/customers/fiscal-lookup?cui=${encodeURIComponent(cui)}`);
}
