import { isRecord, readOptionalNotes, readOptionalText, readRequiredText } from "./text.js";

/**
 * A historical work: something done for the customer before (or outside) WorkOS, recorded
 * from what is known. It carries no operations, sessions, acceptances or orders: none are
 * invented for the past. The event date (when it happened, as precisely as known) is distinct
 * from `recordedAt` (when it was entered).
 */
export const HISTORICAL_WORK_PROVENANCE = "HISTORICAL_RECORD" as const;
export const HISTORICAL_WORK_PROVENANCE_LABEL = "Înregistrare istorică — anterioară sistemului";

export const HISTORICAL_WORK_TITLE_MAX_LENGTH = 160;
export const HISTORICAL_WORK_REFERENCE_MAX_LENGTH = 60;
export const HISTORICAL_WORK_DESCRIPTION_MAX_LENGTH = 4000;

/** "2021", "2021-06" or "2021-06-14": the precision the operator actually knows. */
export type PartialDate = string;
export type PartialDatePrecision = "YEAR" | "MONTH" | "DAY";

export type HistoricalWork = {
  workId: string;
  customerId: string;
  siteId: string | null;
  siteSnapshot: { siteId: string; name: string; address: string | null; city: string | null } | null;
  title: string;
  reference: string | null;
  description: string | null;
  eventDate: PartialDate;
  eventDateEnd: PartialDate | null;
  provenance: typeof HISTORICAL_WORK_PROVENANCE;
  recordedAt: string;
  recordedByAccountId: string;
  updatedAt: string;
  revision: number;
};

export type HistoricalWorkFields = Pick<
  HistoricalWork,
  "siteId" | "title" | "reference" | "description" | "eventDate" | "eventDateEnd"
>;

export function generateHistoricalWorkId(): string {
  return `hwork:${crypto.randomUUID()}`;
}

const PARTIAL_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parsePartialDate(value: string): { ok: true; date: PartialDate; precision: PartialDatePrecision } | { ok: false } {
  const match = PARTIAL_DATE.exec(value.trim());
  if (!match) return { ok: false };
  const year = Number(match[1]);
  if (year < 1900 || year > 2200) return { ok: false };
  if (!match[2]) return { ok: true, date: match[1] ?? "", precision: "YEAR" };
  const month = Number(match[2]);
  if (month < 1 || month > 12) return { ok: false };
  if (!match[3]) return { ok: true, date: `${match[1]}-${match[2]}`, precision: "MONTH" };
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return { ok: false };
  return { ok: true, date: `${match[1]}-${match[2]}-${match[3]}`, precision: "DAY" };
}

/** Sort key: a partial date sorts at the start of its period. */
export function partialDateSortKey(date: PartialDate): string {
  if (date.length === 4) return `${date}-01-01`;
  if (date.length === 7) return `${date}-01`;
  return date;
}

export function partialDateYear(date: PartialDate): number {
  return Number(date.slice(0, 4));
}

const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];

export function formatPartialDate(date: PartialDate): string {
  const [year, month, day] = date.split("-");
  if (!month) return year ?? date;
  const monthLabel = MONTHS[Number(month) - 1] ?? month;
  return day ? `${Number(day)} ${monthLabel} ${year}` : `${monthLabel} ${year}`;
}

export function formatPartialDatePeriod(start: PartialDate, end: PartialDate | null): string {
  return end && end !== start ? `${formatPartialDate(start)} – ${formatPartialDate(end)}` : formatPartialDate(start);
}

function readPartialDate(value: unknown, required: boolean): { ok: true; value: PartialDate | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return required ? { ok: false } : { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const parsed = parsePartialDate(value);
  return parsed.ok ? { ok: true, value: parsed.date } : { ok: false };
}

/**
 * Reads create (all required fields present) or patch (only present keys) input. The event
 * cannot lie in the future of `today`; the end of a period cannot precede its start.
 */
export function readHistoricalWorkInput(
  body: unknown,
  current: HistoricalWorkFields | null,
  today: string,
): { ok: true; fields: HistoricalWorkFields } | { ok: false; field: string } {
  if (!isRecord(body)) return { ok: false, field: "body" };
  const base: HistoricalWorkFields = current ?? {
    siteId: null,
    title: "",
    reference: null,
    description: null,
    eventDate: "",
    eventDateEnd: null,
  };
  const next = { ...base };
  if (!current || "title" in body) {
    const read = readRequiredText(body.title, HISTORICAL_WORK_TITLE_MAX_LENGTH);
    if (!read.ok) return { ok: false, field: "title" };
    next.title = read.value ?? "";
  }
  if ("reference" in body) {
    const read = readOptionalText(body.reference, HISTORICAL_WORK_REFERENCE_MAX_LENGTH);
    if (!read.ok) return { ok: false, field: "reference" };
    next.reference = read.value;
  }
  if ("description" in body) {
    const read = readOptionalNotes(body.description, HISTORICAL_WORK_DESCRIPTION_MAX_LENGTH);
    if (!read.ok) return { ok: false, field: "description" };
    next.description = read.value;
  }
  if (!current || "eventDate" in body) {
    const read = readPartialDate(body.eventDate, true);
    if (!read.ok || !read.value) return { ok: false, field: "eventDate" };
    next.eventDate = read.value;
  }
  if ("eventDateEnd" in body) {
    const read = readPartialDate(body.eventDateEnd, false);
    if (!read.ok) return { ok: false, field: "eventDateEnd" };
    next.eventDateEnd = read.value;
  }
  if ("siteId" in body) {
    if (body.siteId !== null && body.siteId !== "" && typeof body.siteId !== "string") return { ok: false, field: "siteId" };
    next.siteId = typeof body.siteId === "string" && body.siteId ? body.siteId : null;
  }
  if (partialDateSortKey(next.eventDate) > today) return { ok: false, field: "eventDate" };
  if (next.eventDateEnd) {
    if (partialDateSortKey(next.eventDateEnd) < partialDateSortKey(next.eventDate)) return { ok: false, field: "eventDateEnd" };
    if (partialDateSortKey(next.eventDateEnd) > today) return { ok: false, field: "eventDateEnd" };
  }
  return { ok: true, fields: next };
}
