const CANONICAL_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCanonicalCalendarDate(
  value: string,
): { ok: true; date: string } | { ok: false } {
  const match = CANONICAL_CALENDAR_DATE.exec(value);
  if (!match) {
    return { ok: false };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return { ok: false };
  }
  return { ok: true, date: `${match[1]}-${match[2]}-${match[3]}` };
}

export function calendarDateOrderIsValid(
  from: string | null | undefined,
  until: string | null | undefined,
): boolean {
  if (!from || !until) {
    return true;
  }
  return from <= until;
}

/** `Valid până la YYYY-MM-DD` covers that whole UTC calendar date and expires the next day. */
export const VALID_UNTIL_INCLUSIVE = true;

export function calendarDateFromUtcInstant(
  value: string,
): { ok: true; date: string } | { ok: false } {
  const already = parseCanonicalCalendarDate(value);
  if (already.ok) {
    return already;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return { ok: false };
  }
  const utc = new Date(ms);
  const year = String(utc.getUTCFullYear()).padStart(4, "0");
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return parseCanonicalCalendarDate(`${year}-${month}-${day}`);
}

export function calendarDateCoversAsOf(input: {
  validFrom?: string | null;
  validUntil?: string | null;
  asOf: string;
}): boolean {
  const asOf = calendarDateFromUtcInstant(input.asOf);
  if (!asOf.ok) {
    return false;
  }
  if (input.validFrom) {
    const from = parseCanonicalCalendarDate(input.validFrom);
    if (!from.ok || from.date > asOf.date) {
      return false;
    }
  }
  if (input.validUntil) {
    const until = parseCanonicalCalendarDate(input.validUntil);
    if (!until.ok || until.date < asOf.date) {
      return false;
    }
  }
  return true;
}
