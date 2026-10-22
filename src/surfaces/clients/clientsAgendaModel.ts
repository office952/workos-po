import type { CustomerRegistryItemTransport, CustomerRegistryTransport, CustomerWorkspaceTransport } from "../../api/types";
import { matchesSearch } from "../../presentation/listFilter";
import { jobsHref, quotesHref, requestsHref } from "../../routing/appRoute";
import type { DeskSignal } from "../desk/DeskSignalBoard";

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const OTHER_LETTER = "#";

const LEGAL_FORMS = new Set(["SRL", "SA", "SC", "PFA", "II", "IF", "SNC", "SCS", "SCA", "SRL-D", "SRLD"]);

function plain(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The agenda letter: first letter of the name without diacritics; anything else files under "#". */
export function agendaLetter(name: string): string {
  const first = plain(name.trim()).charAt(0).toUpperCase();
  return ALPHABET.includes(first) ? first : OTHER_LETTER;
}

/** Presentation-only monogram: first letters of the first two words that are not a legal form. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word && !LEGAL_FORMS.has(plain(word).toUpperCase().replace(/[.,]/g, "")));
  const letters = words.length >= 2 ? `${words[0]?.charAt(0) ?? ""}${words[1]?.charAt(0) ?? ""}` : (words[0] ?? name).slice(0, 2);
  return letters.toUpperCase() || "—";
}

export type ClientChip = "all" | "attention" | "ACTIVE" | "RETIRED";

export type ClientFilters = { query: string; chip: ClientChip };

export function filterClients(items: readonly CustomerRegistryItemTransport[], filters: ClientFilters): CustomerRegistryItemTransport[] {
  return items
    .filter(
      (customer) =>
        (filters.chip === "all" ||
          (filters.chip === "attention" && customer.needsAttention) ||
          customer.status === filters.chip) &&
        matchesSearch(filters.query, [
          customer.displayName, customer.city, customer.cui, customer.contactName, customer.phone, customer.email,
          customer.statusLabel, customer.attentionLabel,
        ]),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ro", { sensitivity: "base" }));
}

export type AgendaGroup = { letter: string; items: CustomerRegistryItemTransport[] };

export function groupByLetter(items: readonly CustomerRegistryItemTransport[]): AgendaGroup[] {
  const groups: AgendaGroup[] = [];
  for (const item of items) {
    const letter = agendaLetter(item.displayName);
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  }
  // "#" files after Z.
  return groups.sort((a, b) => (a.letter === OTHER_LETTER ? 1 : b.letter === OTHER_LETTER ? -1 : a.letter.localeCompare(b.letter)));
}

export function clientSignals(registry: CustomerRegistryTransport | undefined, filters: ClientFilters): DeskSignal[] {
  const summary = registry?.summary;
  return [
    { id: "all", label: "Toți", count: summary?.total ?? null, tone: "neutral", pressed: filters.chip === "all" },
    { id: "attention", label: "Necesită acțiune", count: summary?.needsAttention ?? null, tone: "attention", pressed: filters.chip === "attention" },
    { id: "ACTIVE", label: "Activi", count: summary?.active ?? null, tone: "neutral", pressed: filters.chip === "ACTIVE", groupStart: true },
    { id: "RETIRED", label: "Retrași", count: summary?.retired ?? null, tone: "neutral", pressed: filters.chip === "RETIRED" },
  ];
}

export function identityLine(customer: Pick<CustomerRegistryItemTransport, "city" | "cui">): { text: string; missing: boolean } {
  const parts = [customer.city, customer.cui ? `CUI ${customer.cui}` : null].filter(Boolean);
  if (parts.length === 2) return { text: parts.join("  ·  "), missing: false };
  if (parts.length === 1) return { text: `${parts[0]}  ·  ${customer.city ? "CUI necompletat" : "localitate necompletată"}`, missing: false };
  return { text: "Localitate și CUI necompletate", missing: true };
}

/** One line of the client card: a request, offer or job from the client's workspace. */
export type ClientDocument = {
  id: string;
  kind: "Cerere" | "Ofertă" | "Lucrare";
  title: string;
  detail: string;
  state: string;
  needsAttention: boolean;
  attentionLabel: string | null;
  createdAt: string | null;
  href: string;
};

export function clientDocuments(workspace: CustomerWorkspaceTransport): ClientDocument[] {
  return [
    ...workspace.requests.map((item): ClientDocument => ({
      id: `request:${item.requestId}`,
      kind: "Cerere",
      title: item.reference ?? item.title,
      detail: item.title,
      state: item.statusLabel,
      needsAttention: item.needsAttention,
      attentionLabel: item.attentionLabel,
      createdAt: item.createdAt,
      href: requestsHref(item.requestId),
    })),
    ...workspace.quotes.map((item): ClientDocument => ({
      id: `quote:${item.quoteSnapshotId}`,
      kind: "Ofertă",
      title: item.reference,
      detail: item.productLabel,
      state: item.stageLabel,
      needsAttention: item.needsAttention,
      attentionLabel: item.attentionLabel,
      createdAt: item.createdAt,
      href: quotesHref({ quoteId: item.quoteSnapshotId }),
    })),
    ...workspace.jobs.map((item): ClientDocument => ({
      id: `job:${item.jobId}`,
      kind: "Lucrare",
      title: item.inscription || item.productLabel,
      detail: item.productLabel,
      state: item.stageLabel,
      needsAttention: item.needsAttention,
      attentionLabel: item.attentionLabel,
      createdAt: item.createdAt,
      href: jobsHref(item.jobId),
    })),
  ];
}

function time(value: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** "Necesită acțiune" = documents the server flags; "Ultimele documente" = the latest others, by createdAt. */
export function cardSections(documents: readonly ClientDocument[], recentLimit = 3) {
  const attention = documents.filter((item) => item.needsAttention);
  const recent = documents
    .filter((item) => !item.needsAttention)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .slice(0, recentLimit);
  return { attention, recent };
}
