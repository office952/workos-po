import { getJson, patchJson, postForm, postJson } from "./http";
import type { RequestPatchInput } from "./types";

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

export async function uploadRequestAttachment(
  requestId: string,
  file: File,
): Promise<unknown> {
  const body = new FormData();
  body.append("file", file);
  return postForm(`/api/requests/${encodeURIComponent(requestId)}/attachments`, body);
}

export async function patchRequest(
  requestId: string,
  input: RequestPatchInput,
): Promise<unknown> {
  return patchJson(`/api/requests/${encodeURIComponent(requestId)}`, input);
}

export async function patchRequestInstallationPrice(
  requestId: string,
  netPrice: number,
): Promise<unknown> {
  return patchJson(`/api/requests/${encodeURIComponent(requestId)}/installation-price`, {
    netPrice,
  });
}

export async function patchRequestInstallationFacts(
  requestId: string,
  input: { expectedVersion: number } & Record<string, unknown>,
): Promise<unknown> {
  return patchJson(
    `/api/requests/${encodeURIComponent(requestId)}/installation-facts`,
    input,
  );
}
