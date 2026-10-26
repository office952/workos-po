export const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const longDate = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** N-022 · "luni, 30 noiembrie 2026" for a YYYY-MM-DD value; null when the value is not a real day. */
export function presentDeadlineDay(value: string): string | null {
  if (!CALENDAR_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return longDate.format(date);
}
