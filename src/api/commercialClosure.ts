import { postJson } from "./http";

export type CommercialDispositionCode = "NOT_PURSUED" | "DECLINED_BY_CUSTOMER";

export type CommercialDecisionGroupInput = {
  disposition: CommercialDispositionCode;
  reason: string;
  quoteSnapshotIds: readonly string[];
};

export async function saveCommercialDecisions(
  requestId: string,
  input: {
    groups: readonly CommercialDecisionGroupInput[];
    close: boolean;
    closeReason: string | null;
    expectedRevision: number;
    operationId: string;
  },
): Promise<unknown> {
  return postJson(`/api/requests/${encodeURIComponent(requestId)}/commercial/decisions`, input);
}

export async function reopenCommercialRequest(
  requestId: string,
  input: { reason: string; expectedRevision: number; operationId: string },
): Promise<unknown> {
  return postJson(`/api/requests/${encodeURIComponent(requestId)}/commercial/reopen`, input);
}

export async function resumeCommercialOffer(
  requestId: string,
  quoteSnapshotId: string,
  input: { reason: string; expectedRevision: number; operationId: string },
): Promise<unknown> {
  return postJson(
    `/api/requests/${encodeURIComponent(requestId)}/quotes/${encodeURIComponent(quoteSnapshotId)}/resume`,
    input,
  );
}
