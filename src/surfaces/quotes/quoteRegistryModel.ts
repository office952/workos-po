import type { QuoteKindTransport, QuoteListItemTransport } from "../../api/types";
import { formatTimestamp } from "../../presentation/format";
import { matchesSearch } from "../../presentation/listFilter";
import { jobHref, registryQuoteHref } from "../../routing/appRoute";

/** Registry filters stay presentation state: every label and flag comes from the server list. */
export const ALL = "all";

export type KindFilter = typeof ALL | QuoteKindTransport;

/** Commercial filters of Oferte; each reads one server flag of the offer. */
export const COMMERCIAL_FILTERS = [
  { id: "ALL", label: "Toate", hint: "toate ofertele, inclusiv versiunile înlocuite" },
  { id: "FOLLOW_UP", label: "De urmărit", hint: "oferte nedecise sau comenzi de confirmat" },
  { id: "ORDERED", label: "Cu comandă", hint: "lucrul continuă în fișa lucrării" },
  { id: "DECIDED", label: "Decise", hint: "refuzate de client sau scoase din urmărire" },
] as const;

export type QuoteCommercialFilter = (typeof COMMERCIAL_FILTERS)[number]["id"];

export function matchesQuoteCommercial(item: QuoteListItemTransport, filter: QuoteCommercialFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "FOLLOW_UP":
      return item.followUp;
    case "ORDERED":
      return item.commercialStatus === "ORDERED";
    case "DECIDED":
      return item.decided;
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

export type RegistryFilters = {
  query: string;
  kind: KindFilter;
  commercial: QuoteCommercialFilter;
};

export const EMPTY_FILTERS: RegistryFilters = { query: "", kind: ALL, commercial: "ALL" };

export const KIND_OPTIONS: readonly { id: KindFilter; label: string }[] = [
  { id: ALL, label: "Toate" },
  { id: "PRODUCT", label: "Produse" },
  { id: "ASSEMBLY", label: "Ansambluri" },
];

export function hasActiveFilter(filters: RegistryFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.kind !== ALL ||
    filters.commercial !== "ALL"
  );
}

export function showsKindFilter(items: readonly QuoteListItemTransport[]): boolean {
  return new Set(items.map((item) => item.kind)).size > 1;
}

export function filterQuotes(
  items: readonly QuoteListItemTransport[],
  filters: RegistryFilters,
): QuoteListItemTransport[] {
  const kindApplies = showsKindFilter(items);
  return items.filter(
    (item) =>
      matchesQuoteCommercial(item, filters.commercial) &&
      (filters.kind === ALL || !kindApplies || item.kind === filters.kind) &&
      matchesSearch(filters.query, [
        item.reference,
        item.inscription,
        item.productLabel,
        item.customerDisplayName,
        item.commercialStatusLabel,
        item.requestReference,
        item.kindLabel,
      ]),
  );
}

export type SignalTile = {
  id: string;
  label: string;
  count: number;
  tone: "neutral" | "attention";
  /** What the count is made of, said once beside it. */
  scope: string | null;
  pressed: boolean;
  apply: (filters: RegistryFilters) => RegistryFilters;
};

/** Counters double as filters. Counts are loaded records read by server flags, never a business total. */
export function presentSignalTiles(
  items: readonly QuoteListItemTransport[],
  filters: RegistryFilters,
): SignalTile[] {
  return COMMERCIAL_FILTERS.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count: items.filter((item) => matchesQuoteCommercial(item, filter.id)).length,
    tone: "neutral",
    scope: filter.hint,
    pressed: filters.commercial === filter.id,
    apply: (current: RegistryFilters) => ({
      ...current,
      commercial: filter.id === "ALL" || current.commercial === filter.id ? "ALL" : filter.id,
    }),
  }));
}

export function kindDetail(item: QuoteListItemTransport): string {
  return item.kind === "ASSEMBLY" ? `${item.kindLabel} · ${item.sectionCount} secțiuni` : item.kindLabel;
}

/** The inscription names the branch; without one the product stands in, never a code. */
export function identityOf(item: QuoteListItemTransport): { title: string; subtitle: string | null } {
  const inscription = item.inscription?.trim();
  if (inscription) return { title: inscription, subtitle: item.productLabel || null };
  return { title: item.productLabel || item.kindLabel || "Ofertă", subtitle: null };
}

/** Commercial status of this one offer, exactly as the server names it. */
export function commercialState(item: QuoteListItemTransport): string {
  return item.commercialStatusLabel?.trim() || "—";
}

export type ListValue = { amount: string; currency: string | null };

/** The registry's own display value: shown as received, never recomputed. */
export function listValue(item: QuoteListItemTransport): ListValue | null {
  return item.grossDisplay ? { amount: item.grossDisplay, currency: item.currency } : null;
}

export function listValueLabel(item: QuoteListItemTransport): string | null {
  const value = listValue(item);
  return value ? [value.amount, value.currency].filter(Boolean).join(" ") : null;
}

export function createdLabel(item: QuoteListItemTransport): string | null {
  return formatTimestamp(item.createdAt);
}

const shortStamp = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Day, month and time for the dense register line; the full date stays in the dossier. */
export function createdShortLabel(item: QuoteListItemTransport): string | null {
  if (!item.createdAt) return null;
  const date = new Date(item.createdAt);
  return Number.isNaN(date.getTime()) ? item.createdAt : shortStamp.format(date);
}

export function positionIn(items: readonly QuoteListItemTransport[], quoteId: string | null): number {
  return quoteId ? items.findIndex((item) => item.quoteSnapshotId === quoteId) : -1;
}

/** Editable targets keep their own keys: arrows and "/" never steal typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Where a dossier link lands, said in operator words. */
export function destinationOf(href: string, item: QuoteListItemTransport): string {
  if (item.orderSnapshotId && href === jobHref(item.orderSnapshotId)) return "fișa lucrării, în Lucrări";
  if (href === registryQuoteHref(item)) {
    return item.commercialStatus === "ACCEPTED_WITHOUT_ORDER" ? "pagina ofertei, unde se confirmă comanda" : "pagina ofertei";
  }
  if (href.startsWith("/ansamblu")) return "pagina ansamblului";
  return "pagina asociată";
}

