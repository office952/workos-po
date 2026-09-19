import { formatQuantityValue } from "./format";

export function draftCompletedQuantity(plannedQuantity: number): string {
  return formatQuantityValue(plannedQuantity);
}

export function parseCompletedQuantity(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || !/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}
