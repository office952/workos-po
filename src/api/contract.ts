export const UI20_TRANSPORT_CONTRACT_ID = "workos-ui-contract-v1" as const;

export type TransportContractId = typeof UI20_TRANSPORT_CONTRACT_ID;

export type ContractCheck =
  | { status: "compatible"; contractId: TransportContractId }
  | { status: "incompatible"; received: string | null; reason: string };

export function assertUi20Contract(payload: unknown): ContractCheck {
  if (payload === null || typeof payload !== "object") {
    return {
      status: "incompatible",
      received: null,
      reason: "Răspunsul de sănătate al API nu este un obiect.",
    };
  }

  const record = payload as { apiContractId?: unknown };
  const received =
    typeof record.apiContractId === "string" ? record.apiContractId : null;

  if (received === UI20_TRANSPORT_CONTRACT_ID) {
    return { status: "compatible", contractId: UI20_TRANSPORT_CONTRACT_ID };
  }

  return {
    status: "incompatible",
    received,
    reason:
      received === null
        ? "Identitatea contractului lipsește din răspunsul de sănătate."
        : "Identitatea contractului nu este recunoscută.",
  };
}
