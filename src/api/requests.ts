import { getJson, postJson } from "./http";

export async function fetchRequests(): Promise<unknown> {
  return getJson("/api/requests");
}

export async function fetchRequest(requestId: string): Promise<unknown> {
  return getJson(`/api/requests/${encodeURIComponent(requestId)}`);
}

export async function createRequest(input: {
  customerId: string;
  title: string;
  description: string;
}): Promise<unknown> {
  return postJson("/api/requests", input);
}
