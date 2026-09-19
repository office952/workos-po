import { deleteJson, getJson, postJson, putJson } from "./http";

export async function fetchOperatorCandidates(): Promise<unknown> {
  return getJson("/api/operator-candidates");
}

export async function fetchOperatorSession(): Promise<unknown> {
  return getJson("/api/operator-session");
}

export async function identifyOperator(personId: string, pin: string): Promise<unknown> {
  return postJson("/api/operator-session", { personId, pin });
}

export async function logoutOperator(): Promise<unknown> {
  return deleteJson("/api/operator-session");
}

export async function fetchOperatorInbox(): Promise<unknown> {
  return getJson("/api/operator-task-inbox");
}

export async function configureOperatorPin(
  personId: string,
  pin: string,
  confirmPin: string,
): Promise<unknown> {
  return putJson(`/api/people/${encodeURIComponent(personId)}/operator-pin`, {
    pin,
    confirmPin,
  });
}
