import { assertUi20Contract, type ContractCheck } from "../api/contract";
import { isHealthTransport } from "../api/health";
import type { HealthTransport } from "../api/types";

export type HealthPresentation =
  | {
      kind: "compatible";
      service: string;
      contractId: HealthTransport["apiContractId"];
    }
  | {
      kind: "incompatible";
      reason: string;
      received: string | null;
    };

export function presentHealth(payload: unknown): HealthPresentation {
  const check: ContractCheck = assertUi20Contract(payload);
  if (check.status === "incompatible") {
    return {
      kind: "incompatible",
      reason: check.reason,
      received: check.received,
    };
  }

  if (!isHealthTransport(payload)) {
    return {
      kind: "incompatible",
      reason: "Răspunsul de sănătate nu are forma așteptată.",
      received: check.contractId,
    };
  }

  return {
    kind: "compatible",
    service: payload.service,
    contractId: payload.apiContractId,
  };
}
