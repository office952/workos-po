import { getJson } from "./http";
import type { HealthTransport } from "./types";

export async function fetchHealth(): Promise<unknown> {
  return getJson("/api/health");
}

export function isHealthTransport(payload: unknown): payload is HealthTransport {
  if (payload === null || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    typeof record.status === "string" &&
    typeof record.service === "string" &&
    typeof record.apiContractId === "string"
  );
}
