import { sha256Hex } from "../production/digest.js";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = sortValue(entry);
      }
    }
    return sorted;
  }
  return value;
}
