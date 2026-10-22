import type { RequestListItemTransport, RequestOverviewSummaryTransport } from "../../api/types";
import { matchesSearch } from "../../presentation/listFilter";
import { readRegistryMemory, writeRegistryMemory } from "../../session/registryMemory";
import { REQUESTS_MEMORY_KEY } from "../../session/registryMemoryKeys";
import type { DeskSignal } from "../desk/DeskSignalBoard";
import type { Density } from "../desk/DeskToolbar";

/** Preparation trays: one per request status, counted by the server summary. */
export const TRAYS = [
  { status: "NEW", label: "Noi", summary: "newCount" },
  { status: "IN_REVIEW", label: "În analiză", summary: "inReview" },
  { status: "WAITING_CUSTOMER", label: "Așteaptă clientul", summary: "waitingCustomer" },
  { status: "READY_FOR_QUOTE", label: "Gata de ofertare", summary: "readyForQuote" },
  { status: "BLOCKED", label: "Blocate", summary: "blocked" },
] as const satisfies readonly { status: string; label: string; summary: keyof RequestOverviewSummaryTransport }[];

/** Commercial progress, by server code. Independent of the request status. */
const PROGRESS_STEPS: Record<string, number> = { QUOTE_CREATED: 1, QUOTE_ACCEPTED: 2, ORDER_CREATED: 3 };
export const PROGRESS_SEGMENTS = ["Ofertă", "Acceptare", "Comandă"] as const;

export function commercialSteps(item: Pick<RequestListItemTransport, "commercialProgress">): number | null {
  if (!item.commercialProgress) return 0;
  return PROGRESS_STEPS[item.commercialProgress] ?? null;
}

export function commercialLabel(item: Pick<RequestListItemTransport, "commercialProgress" | "contextLabel">): string {
  return item.contextLabel?.trim() || (item.commercialProgress ? "—" : "Fără ofertă");
}

export type RequestSort = "newest" | "oldest";

export type RequestFilters = { query: string; attention: boolean; status: string | null };

export const EMPTY_REQUEST_FILTERS: RequestFilters = { query: "", attention: false, status: null };

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function filterRequests(items: readonly RequestListItemTransport[], filters: RequestFilters, sort: RequestSort): RequestListItemTransport[] {
  return items
    .filter(
      (item) =>
        (!filters.attention || item.needsAttention) &&
        (filters.status === null || item.status === filters.status) &&
        matchesSearch(filters.query, [
          item.title, item.reference, item.customerDisplayName, item.contextLabel, item.statusLabel, item.nextActionLabel, item.attentionLabel,
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
  return filters.query.trim() !== "" || filters.attention || filters.status !== null;
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

export function requestSignals(summary: RequestOverviewSummaryTransport | null, items: readonly RequestListItemTransport[], filters: RequestFilters): DeskSignal[] {
  return [
    { id: "all", label: "Toate", count: summary?.total ?? items.length, tone: "neutral", pressed: !filters.attention && filters.status === null },
    {
      id: "attention",
      label: "Necesită acțiune",
      count: summary?.needsAttention ?? items.filter((item) => item.needsAttention).length,
      tone: "attention",
      pressed: filters.attention,
    },
  ];
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
        attention: filters.attention === true,
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
