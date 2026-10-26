/**
 * Shared field readers for the customer dossier. A missing or blank value stays `null`
 * ("necompletat"); an over-long or non-string value is refused, never truncated.
 */
export type FieldRead = { ok: true; value: string | null } | { ok: false };

export function readOptionalText(value: unknown, maxLength: number): FieldRead {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  return trimmed.length <= maxLength ? { ok: true, value: trimmed } : { ok: false };
}

/** Multi-line notes keep their line breaks. */
export function readOptionalNotes(value: unknown, maxLength: number): FieldRead {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  return trimmed.length <= maxLength ? { ok: true, value: trimmed } : { ok: false };
}

export function readRequiredText(value: unknown, maxLength: number): FieldRead {
  const read = readOptionalText(value, maxLength);
  return read.ok && read.value !== null ? read : { ok: false };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
