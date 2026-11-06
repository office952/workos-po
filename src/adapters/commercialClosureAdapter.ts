import { readTransportErrorCode, readTransportReasons, TransportError } from "../api/http";
import type { RequestDetailTransport } from "../api/types";
import { asNumber, asRecord } from "./record";
import { presentRequestDetail } from "./requestAdapter";

export type CommercialMutationOutcome =
  | { ok: true; alreadyApplied: boolean; detail: RequestDetailTransport | null }
  | {
      ok: false;
      status: number;
      code: string | null;
      reasons: string[];
      currentRevision: number | null;
      conflict: boolean;
    };

export function presentCommercialMutation(payload: unknown): Extract<CommercialMutationOutcome, { ok: true }> {
  const record = asRecord(payload);
  return {
    ok: true,
    alreadyApplied: record?.alreadyApplied === true,
    detail: presentRequestDetail(record),
  };
}

export function presentCommercialMutationFailure(error: unknown): Extract<CommercialMutationOutcome, { ok: false }> {
  if (!(error instanceof TransportError)) {
    return {
      ok: false,
      status: 0,
      code: null,
      reasons: ["Operația comercială nu a reușit."],
      currentRevision: null,
      conflict: false,
    };
  }
  const body = asRecord(error.body);
  const code = readTransportErrorCode(error.body);
  const reasons = readTransportReasons(error.body);
  return {
    ok: false,
    status: error.status,
    code,
    reasons: reasons.length > 0 ? reasons : ["Operația comercială nu a reușit."],
    currentRevision: asNumber(body?.currentRevision),
    conflict: error.status === 409,
  };
}

export function newCommercialOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
