export function parseActualDurationDraft(
  value: string,
): { ok: true; actualDurationMinutes?: number } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }
  return { ok: true, actualDurationMinutes: Number(trimmed) };
}
