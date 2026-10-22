import type { QuoteKindTransport, QuoteListItemTransport } from "../../api/types";
import { formatTimestamp } from "../../presentation/format";
import { matchesSearch, uniqueLabels } from "../../presentation/listFilter";
import { jobHref, registryQuoteHref } from "../../routing/appRoute";

/** Registry filters stay presentation state: every label and flag comes from the server list. */
export const ALL = "all";

export type KindFilter = typeof ALL | QuoteKindTransport;

export type RegistryFilters = {
  query: string;
  kind: KindFilter;
  stage: string;
  attention: boolean;
};

export const EMPTY_FILTERS: RegistryFilters = { query: "", kind: ALL, stage: ALL, attention: false };

export const KIND_OPTIONS: readonly { id: KindFilter; label: string }[] = [
  { id: ALL, label: "Toate" },
  { id: "PRODUCT", label: "Produse" },
  { id: "ASSEMBLY", label: "Ansambluri" },
];

export function hasActiveFilter(filters: RegistryFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.kind !== ALL ||
    filters.stage !== ALL ||
    filters.attention
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
      (!filters.attention || item.needsAttention) &&
      (filters.kind === ALL || !kindApplies || item.kind === filters.kind) &&
      (filters.stage === ALL || item.stageLabel === filters.stage) &&
      matchesSearch(filters.query, [
        item.reference,
        item.inscription,
        item.productLabel,
        item.customerDisplayName,
        item.stageLabel,
        item.nextActionLabel,
        item.requestReference,
        item.attentionLabel,
        item.kindLabel,
      ]),
  );
}

export type SignalTile = {
  id: string;
  label: string;
  count: number;
  tone: "neutral" | "attention";
  pressed: boolean;
  apply: (filters: RegistryFilters) => RegistryFilters;
};

/** Counters double as filters. Counts are loaded records, never a business total. */
export function presentSignalTiles(
  items: readonly QuoteListItemTransport[],
  filters: RegistryFilters,
): SignalTile[] {
  const stages = uniqueLabels(items.map((item) => item.stageLabel));
  const tiles: SignalTile[] = [
    {
      id: "all",
      label: "Toate",
      count: items.length,
      tone: "neutral",
      pressed: !filters.attention && filters.stage === ALL,
      apply: (current) => ({ ...current, attention: false, stage: ALL }),
    },
    {
      id: "attention",
      label: "Necesită atenție",
      count: items.filter((item) => item.needsAttention).length,
      tone: "attention",
      pressed: filters.attention,
      apply: (current) => ({ ...current, attention: !current.attention }),
    },
  ];
  if (stages.length > 1) {
    for (const stage of stages) {
      tiles.push({
        id: `stage:${stage}`,
        label: stage,
        count: items.filter((item) => item.stageLabel === stage).length,
        tone: "neutral",
        pressed: filters.stage === stage,
        apply: (current) => ({ ...current, stage: current.stage === stage ? ALL : stage }),
      });
    }
  }
  return tiles;
}

export function formatCount(value: number): string {
  return String(value).padStart(2, "0");
}

export function kindDetail(item: QuoteListItemTransport): string {
  return item.kind === "ASSEMBLY" ? `${item.kindLabel} · ${item.sectionCount} secțiuni` : item.kindLabel;
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

export const ACCEPTANCE_ACTIONS = new Set(["ACCEPT_QUOTE", "CREATE_ORDER"]);

/** Where a dossier link lands, said in operator words. */
export function destinationOf(href: string, item: QuoteListItemTransport): string {
  if (item.orderSnapshotId && href === jobHref(item.orderSnapshotId)) return "fișa lucrării, în Lucrări";
  if (href === registryQuoteHref(item)) {
    return ACCEPTANCE_ACTIONS.has(item.nextAction) ? "pagina ofertei, unde se confirmă comanda" : "pagina ofertei";
  }
  if (href.startsWith("/ansamblu")) return "pagina ansamblului";
  return "pagina asociată";
}

