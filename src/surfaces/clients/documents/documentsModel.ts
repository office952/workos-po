import type { CustomerDossierModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import { jobHref, requestHref } from "../../../routing/appRoute";
import { formatDay } from "../dossier/dossierModel";
import { clientListHref, EMPTY_LIST_CONTEXT, type ListContext } from "../dossier/listContext";

/**
 * N-020 etapa 5 · Documente (Figma 670:16320 · 707:22045 · 673:18393 · 673:17004 · 707:22391).
 * Presentation over the dossier the server sent: what a document is, where it belongs, how it is
 * found and filtered. Every word about a document is its metadata or a server label; nothing here
 * decides that an invoice is paid, a contract signed or a report accepted.
 */

export type SiteRef = { siteId: string; name: string };

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The non-photo files of the client, each once (photos are in Fotografii). */
export function ownDocuments(dossier: Pick<CustomerDossierModel, "documents">): DossierDocument[] {
  return dossier.documents.filter((document) => document.kind !== "PHOTO");
}

/**
 * The year a document is grouped under: its own date; an undated document goes under the year it
 * was uploaded, and says so — the upload day is never shown as its date.
 */
export function documentYear(document: DossierDocument): number {
  return Number((document.documentDate ?? document.uploadedAt).slice(0, 4));
}

export function documentSortKey(document: DossierDocument): string {
  return document.documentDate ?? document.uploadedAt.slice(0, 10);
}

/** "23.10.2026", or "fără dată" for an undated document (its upload day stays apart). */
export function documentDateLabel(document: DossierDocument): string {
  return formatDay(document.documentDate) ?? "fără dată";
}

/** "PDF", "JPG"… from the file name; null when it has no extension. */
export function fileFormat(document: DossierDocument): string | null {
  const dot = document.originalFileName.lastIndexOf(".");
  return dot > 0 ? document.originalFileName.slice(dot + 1).toUpperCase() : null;
}

/**
 * The sites a document belongs to, from the dossier's own data: a direct site link, the site
 * assigned to the request or job it is linked to (as it was at the assignment), the site of the
 * historical work it is linked to. Each site once, in the order found.
 */
export function documentSites(document: DossierDocument, dossier: Pick<CustomerDossierModel, "sites" | "siteAssignments" | "historicalWorks">): SiteRef[] {
  const sites = new Map(dossier.sites.map((site) => [site.siteId, site.name]));
  const found = new Map<string, string>();
  const add = (siteId: string | null | undefined, name?: string) => {
    if (siteId && !found.has(siteId)) found.set(siteId, sites.get(siteId) ?? name ?? "Sediu");
  };
  for (const link of document.links) {
    if (link.kind === "SITE") add(link.subjectId);
    if (link.kind === "REQUEST" || link.kind === "JOB") {
      const assignment = dossier.siteAssignments.find((item) => item.subjectKind === link.kind && item.subjectId === link.subjectId);
      add(assignment?.siteId);
    }
    if (link.kind === "HISTORICAL_WORK") add(dossier.historicalWorks.find((work) => work.workId === link.subjectId)?.siteId);
  }
  return [...found].map(([siteId, name]) => ({ siteId, name }));
}

/** "Asociere": what a document is attached to (the server's links). */
export const LINK_FILTERS: Array<{ value: string; label: string; test: (document: DossierDocument) => boolean }> = [
  { value: "JOB", label: "Lucrări WorkOS", test: (document) => document.links.some((link) => link.kind === "JOB") },
  { value: "HISTORICAL_WORK", label: "Lucrări istorice", test: (document) => document.links.some((link) => link.kind === "HISTORICAL_WORK") },
  { value: "REQUEST", label: "Cereri", test: (document) => document.links.some((link) => link.kind === "REQUEST") },
  { value: "SITE", label: "Sediu", test: (document) => document.links.some((link) => link.kind === "SITE") },
  { value: "NONE", label: "Doar dosarul clientului", test: (document) => document.links.length === 0 },
];

export type DocumentChoice = { value: string; label: string; count: number };

export type DocumentsView = {
  total: number;
  photoCount: number;
  shown: DocumentItem[];
  groups: Array<{ year: number; documents: DocumentItem[] }>;
  filtered: boolean;
  /** Each count is what the option would show with the text and the other filters kept. */
  kinds: DocumentChoice[];
  years: DocumentChoice[];
  sites: DocumentChoice[];
  links: DocumentChoice[];
};

export type DocumentItem = { document: DossierDocument; sites: SiteRef[]; year: number; undated: boolean };

/**
 * The Documente list: search (title, number, file, kind, description, links — case and
 * diacritics ignored) and Tip / An / Sediu / Asociere, combined with AND, over the whole
 * collection the dossier holds. An active choice that no longer exists stays, at 0.
 */
export function buildDocumentsView(dossier: CustomerDossierModel, context: Pick<ListContext, "q" | "kind" | "year" | "site" | "linked">): DocumentsView {
  const own = ownDocuments(dossier);
  const items: DocumentItem[] = own.map((document) => ({ document, sites: documentSites(document, dossier), year: documentYear(document), undated: !document.documentDate }));
  const needle = plain(context.q.trim());
  // Tip may name several kinds (Date comerciale opens "Contract, Act adițional"), separated by commas.
  const kinds = context.kind ? context.kind.split(",") : [];
  type Skip = "kind" | "year" | "site" | "linked" | null;
  const passes = (item: DocumentItem, skip: Skip) =>
    (skip === "kind" || !kinds.length || kinds.includes(item.document.kind)) &&
    (skip === "year" || !context.year || String(item.year) === context.year) &&
    (skip === "site" || !context.site || item.sites.some((site) => site.siteId === context.site)) &&
    (skip === "linked" || !context.linked || LINK_FILTERS.find((option) => option.value === context.linked)?.test(item.document) !== false) &&
    (!needle ||
      plain(
        [item.document.title, item.document.documentNumber ?? "", item.document.originalFileName, item.document.kindLabel, item.document.description ?? "", ...item.document.links.map((link) => link.label), ...item.sites.map((site) => site.name)].join(" "),
      ).includes(needle));
  const shown = items.filter((item) => passes(item, null)).sort((left, right) => documentSortKey(right.document).localeCompare(documentSortKey(left.document)) || left.document.documentId.localeCompare(right.document.documentId));
  const years = [...new Set(items.map((item) => item.year))].sort((a, b) => b - a);
  const keep = (choices: DocumentChoice[], value: string, label: string) => (value && !choices.some((choice) => choice.value === value) ? [...choices, { value, label, count: 0 }] : choices);
  const count = (skip: Exclude<Skip, null>, test: (item: DocumentItem) => boolean) => items.filter((item) => passes(item, skip) && test(item)).length;
  return {
    total: own.length,
    photoCount: dossier.documents.length - own.length,
    shown,
    groups: years.map((year) => ({ year, documents: shown.filter((item) => item.year === year) })).filter((group) => group.documents.length),
    filtered: Boolean(context.q || context.kind || context.year || context.site || context.linked),
    kinds: [
      // Several kinds at once (Date comerciale → Contract, Act adițional) are one choice of Tip, first,
      // so the menu and the rail show it active and remove it whole — kept even at 0.
      ...(kinds.length > 1
        ? [{ value: context.kind, label: kinds.map((kind) => dossier.vocabulary.documentKinds.find((option) => option.value === kind)?.label ?? kind).join(", "), count: count("kind", (item) => kinds.includes(item.document.kind)) }]
        : []),
      ...keep(
        dossier.vocabulary.documentKinds.filter((option) => option.value !== "PHOTO").map((option) => ({ value: option.value, label: option.label, count: count("kind", (item) => item.document.kind === option.value) })),
        kinds.length > 1 ? "" : context.kind,
        "Tip indisponibil",
      ),
    ],
    years: keep(years.map((year) => ({ value: String(year), label: String(year), count: count("year", (item) => item.year === year) })), context.year, context.year),
    sites: keep(
      dossier.sites.map((site) => ({ value: site.siteId, label: site.status === "ACTIVE" ? site.name : `${site.name} (inactiv)`, count: count("site", (item) => item.sites.some((ref) => ref.siteId === site.siteId)) })),
      context.site,
      "Sediu indisponibil",
    ),
    links: keep(LINK_FILTERS.map((option) => ({ value: option.value, label: option.label, count: count("linked", (item) => option.test(item.document)) })), context.linked, "Asociere indisponibilă"),
  };
}

/** The active filters in words: "Tip: Factură · An 2021 · Depozit Ghimbav · Lucrări istorice". */
export function activeDocumentFilters(view: DocumentsView, context: Pick<ListContext, "kind" | "year" | "site" | "linked">): string[] {
  const label = (choices: DocumentChoice[], value: string) => choices.find((choice) => choice.value === value)?.label ?? value;
  return [
    context.kind ? `Tip: ${label(view.kinds, context.kind)}` : null,
    context.year ? `An ${context.year}` : null,
    context.site ? label(view.sites, context.site) : null,
    context.linked ? label(view.links, context.linked) : null,
  ].filter((value): value is string => Boolean(value));
}

/**
 * Where an association leads: the job sheet, the request, the historical record in Lucrări, the
 * history of the site. Opening it is a new history entry, so Back returns to the same document.
 */
export function linkHref(customerId: string, link: { kind: string; subjectId: string }): string | null {
  if (link.kind === "JOB") return jobHref(link.subjectId);
  if (link.kind === "REQUEST") return requestHref(link.subjectId);
  if (link.kind === "HISTORICAL_WORK") return clientListHref(customerId, "lucrari", EMPTY_LIST_CONTEXT, { lucrare: link.subjectId });
  if (link.kind === "SITE") return clientListHref(customerId, "istoric", { ...EMPTY_LIST_CONTEXT, site: link.subjectId });
  return null;
}

/** What uploading a file does not prove (707:22391 / 707:22609): never read from the PDF. */
export function proofNote(kind: string): string {
  if (kind === "INVOICE") return "Fișierul încărcat nu dovedește încasarea.";
  if (kind === "CONTRACT" || kind === "ADDENDUM") return "Fișierul încărcat nu dovedește semnarea.";
  if (kind === "RECEPTION") return "Fișierul încărcat nu dovedește recepția.";
  return "Fișierul încărcat nu dovedește validarea documentului.";
}

/** Short kind word for the narrow table (707:22045) and the cards: the server's label, upper case. */
export function kindWord(document: DossierDocument): string {
  return document.kindLabel.toLocaleUpperCase("ro");
}
