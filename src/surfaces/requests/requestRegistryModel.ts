import type { RequestListItemTransport, RequestOverviewSummaryTransport } from "../../api/types";
import { matchesSearch } from "../../presentation/listFilter";
import { readRegistryMemory, writeRegistryMemory } from "../../session/registryMemory";
import { REQUESTS_MEMORY_KEY } from "../../session/registryMemoryKeys";
import type { DeskSignal } from "../desk/DeskSignalBoard";
import type { Density } from "../desk/DeskToolbar";

/** Preparation trays: one per request status, counted by the server summary. Secondary to the commercial filters. */
export const TRAYS = [
  { status: "NEW", label: "Noi", summary: "newCount" },
  { status: "IN_REVIEW", label: "În analiză", summary: "inReview" },
  { status: "WAITING_CUSTOMER", label: "Așteaptă clientul", summary: "waitingCustomer" },
  { status: "READY_FOR_QUOTE", label: "Gata de ofertare", summary: "readyForQuote" },
  { status: "BLOCKED", label: "Blocate", summary: "blocked" },
] as const satisfies readonly { status: string; label: string; summary: keyof RequestOverviewSummaryTransport }[];

/** Commercial filters (primary), counted by the server summary; the same names as the request overview. */
export const COMMERCIAL_FILTERS = [
  { id: "ALL", label: "Toate", summary: "total" },
  { id: "ACTIONABLE", label: "De rezolvat", summary: "needsAttention" },
  { id: "NO_OFFER", label: "Fără ofertă", summary: "noOffer" },
  { id: "COMMERCIAL_OPEN", label: "Deschise", summary: "commerciallyOpen" },
  { id: "COMMERCIAL_CLOSED", label: "Încheiate", summary: "commerciallyClosed" },
] as const satisfies readonly { id: string; label: string; summary: keyof RequestOverviewSummaryTransport }[];

export type CommercialFilter = (typeof COMMERCIAL_FILTERS)[number]["id"];

export function isCommercialFilter(value: unknown): value is CommercialFilter {
  return COMMERCIAL_FILTERS.some((filter) => filter.id === value);
}

/** Reads only server journey fields; a row without a journey matches "Toate" alone. */
function matchesCommercial(item: RequestListItemTransport, filter: CommercialFilter): boolean {
  if (filter === "ALL") return true;
  const journey = item.journey;
  if (!journey) return false;
  switch (filter) {
    case "ACTIONABLE":
      return journey.needsAttention;
    case "NO_OFFER":
      return journey.offerSummary.count === 0;
    case "COMMERCIAL_OPEN":
      return journey.phase !== "CLOSED";
    case "COMMERCIAL_CLOSED":
      return journey.phase === "CLOSED";
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

export type RequestSort = "newest" | "oldest";

export type RequestFilters = { query: string; commercial: CommercialFilter; status: string | null };

export const EMPTY_REQUEST_FILTERS: RequestFilters = { query: "", commercial: "ALL", status: null };

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function filterRequests(items: readonly RequestListItemTransport[], filters: RequestFilters, sort: RequestSort): RequestListItemTransport[] {
  return items
    .filter(
      (item) =>
        matchesCommercial(item, filters.commercial) &&
        (filters.status === null || item.status === filters.status) &&
        matchesSearch(filters.query, [
          item.title, item.reference, item.customerDisplayName, item.statusLabel,
          item.journey?.nextActionLabel, item.journey?.offerSummary.summaryLabel, item.journey?.phaseLabel,
        ]),
    )
    .sort((a, b) => {
      const left = timestamp(a.createdAt);
      const right = timestamp(b.createdAt);
      // Unknown dates stay last in either direction; equal dates keep the server order.
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return sort === "newest" ? right - left : left - right;
    });
}

export function hasRequestFilter(filters: RequestFilters): boolean {
  return filters.query.trim() !== "" || filters.commercial !== "ALL" || filters.status !== null;
}

export function commercialFilterLabel(filter: CommercialFilter): string {
  return COMMERCIAL_FILTERS.find((item) => item.id === filter)?.label ?? "Toate";
}

const DAY = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const TIME = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });
const KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

export function entryTime(value: string | null): string {
  const time = timestamp(value);
  return time === null ? "—" : TIME.format(time);
}

export function entryDay(value: string | null): string {
  const time = timestamp(value);
  if (time === null) return "Fără dată";
  const [weekday, ...rest] = DAY.format(time).split(" ");
  return `${(weekday ?? "").replace(/,$/, "").replace(/^./, (c) => c.toUpperCase())} · ${rest.join(" ")}`;
}

export type RequestDay = { key: string; label: string; items: RequestListItemTransport[] };

/** Groups the visible page by local day of createdAt; order is kept as sorted. */
export function groupByDay(items: readonly RequestListItemTransport[]): RequestDay[] {
  const days: RequestDay[] = [];
  for (const item of items) {
    const time = timestamp(item.createdAt);
    const key = time === null ? "none" : KEY.format(time);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: entryDay(item.createdAt), items: [item] });
  }
  return days;
}

/** Counts come only from the server summary; without one they show "—". */
export function requestSignals(summary: RequestOverviewSummaryTransport | null, filters: RequestFilters): DeskSignal[] {
  return COMMERCIAL_FILTERS.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count: summary?.[filter.summary] ?? null,
    tone: filter.id === "ACTIONABLE" ? "attention" : "neutral",
    pressed: filter.id === "ALL" ? filters.commercial === "ALL" && filters.status === null : filters.commercial === filter.id,
  }));
}

/** The page is part of the register context: restored on return, clamped once the list is read. */
export type RequestsMemory = { filters: RequestFilters; sort: RequestSort; density: Density; pageSize: number; page: number };

const DEFAULT_MEMORY: RequestsMemory = { filters: EMPTY_REQUEST_FILTERS, sort: "newest", density: "comfortable", pageSize: 10, page: 1 };

/** The 1-based page that holds the row at this index of the visible list. */
export function pageOfIndex(index: number, pageSize: number): number {
  return Math.floor(Math.max(0, index) / pageSize) + 1;
}

export function readRequestsMemory(): RequestsMemory {
  return readRegistryMemory(REQUESTS_MEMORY_KEY, DEFAULT_MEMORY, (value) => {
    const filters = value.filters && typeof value.filters === "object" ? (value.filters as Record<string, unknown>) : {};
    return {
      filters: {
        query: typeof filters.query === "string" ? filters.query : "",
        commercial: isCommercialFilter(filters.commercial) ? filters.commercial : filters.attention === true ? "ACTIONABLE" : "ALL",
        status: TRAYS.some((tray) => tray.status === filters.status) ? (filters.status as string) : null,
      },
      sort: value.sort === "oldest" ? "oldest" : "newest",
      density: value.density === "compact" ? "compact" : "comfortable",
      pageSize: [10, 20, 50].includes(Number(value.pageSize)) ? Number(value.pageSize) : 10,
      page: Number.isInteger(value.page) && Number(value.page) >= 1 ? Number(value.page) : 1,
    };
  });
}

export function writeRequestsMemory(memory: RequestsMemory): void {
  writeRegistryMemory(REQUESTS_MEMORY_KEY, memory);
}
