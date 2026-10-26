import type { CustomerDossierModel, CustomerWorksModel, DossierDocument, DossierSite, HistoryEntry } from "../../../adapters/customerDossierAdapter";
import { buildDocumentsView } from "../documents/documentsModel";
import { clientListHref, EMPTY_LIST_CONTEXT } from "../dossier/listContext";
import { buildPhotosView, type PhotoGroup } from "../photos/photosModel";
import { draftConflictRows, resumeDraftOnCurrent, type DraftConflictRow } from "../dossier/draftConflict";

/**
 * N-020 etapa 7 · Sedii (Figma 759:451 / 759:185 · 759:1284 · 712:22460 / 712:22814 / 719:75304 /
 * 712:23047). What a site card says, read from the rules the other views already use: each number
 * is what its destination shows when opened with the filter of this site, so the card never holds a
 * second definition of "at this site":
 * - Istoric · N: the server's history facet for the site (`facets.sites[].count`, no other filter);
 * - Lucrări · N: the server's works facet for the site (the same, from `GET …/works`);
 * - Documente · N: the Documente view filtered on the site (`buildDocumentsView`);
 * - Fotografii · N: the Fotografii view filtered on the site (`buildPhotosView`, distinct photos).
 * "Atașate direct" counts only the files linked to the site itself, photos apart from documents.
 * A number the data cannot give yet (a list not read) is left out, never guessed.
 */

export type SiteDestination = { label: string; count: number | null; href: string };

export type SiteSummary = {
  site: DossierSite;
  /** The latest documented photo (before or after mounting, never a simulation) and its group. */
  photo: { document: DossierDocument; group: PhotoGroup } | null;
  destinations: SiteDestination[];
  direct: { documents: number; photos: number };
  /** The newest history entry at the site, when the history the card reads agrees with the server's count. */
  last: HistoryEntry | null;
};

const at = (entry: HistoryEntry, siteId: string) => entry.site?.siteId === siteId || entry.branches.some((branch) => branch.site?.siteId === siteId);
const photoDay = (document: DossierDocument) => document.documentDate ?? document.uploadedAt.slice(0, 10);

export function summarizeSites(
  customerId: string,
  dossier: CustomerDossierModel,
  history: { entries: HistoryEntry[]; sites: Array<{ siteId: string; count: number }> } | null,
  works: CustomerWorksModel | null,
): SiteSummary[] {
  return dossier.sites.map((site) => {
    const filter = { ...EMPTY_LIST_CONTEXT, site: site.siteId };
    const documents = buildDocumentsView(dossier, filter);
    const photos = history ? buildPhotosView(customerId, dossier, history.entries, filter) : null;
    const historyCount = history ? (history.sites.find((item) => item.siteId === site.siteId)?.count ?? 0) : null;
    // The server lists every site of the client in the facet; a count it does not send stays unknown.
    const worksFacet = works?.facets.sites.find((item) => item.siteId === site.siteId);
    const worksCount = works ? (worksFacet ? worksFacet.count : 0) : null;
    // The newest entry at the site, as the server lists them; shown only when the entries read here
    // are exactly those the server counts for the site (the same rule as its history filter).
    const here = history ? history.entries.filter((entry) => at(entry, site.siteId)) : [];
    const last = history && here.length === historyCount ? (here[0] ?? null) : null;
    let photo: SiteSummary["photo"] = null;
    for (const group of photos?.shownGroups ?? []) {
      for (const tile of group.shown) {
        const document = tile.photo;
        if (document.preview !== "IMAGE" || document.photoStage === "SIMULATION") continue;
        if (!photo || photoDay(document) > photoDay(photo.document)) photo = { document, group };
      }
    }
    const direct = dossier.documents.filter((document) => document.links.some((link) => link.kind === "SITE" && link.subjectId === site.siteId));
    return {
      site,
      photo,
      destinations: [
        { label: "Istoric", count: historyCount, href: clientListHref(customerId, "istoric", filter) },
        { label: "Lucrări", count: worksCount, href: clientListHref(customerId, "lucrari", filter) },
        { label: "Documente", count: documents.shown.length, href: clientListHref(customerId, "documente", filter) },
        { label: "Fotografii", count: photos ? photos.shownCount : null, href: clientListHref(customerId, "fotografii", filter) },
      ],
      direct: { documents: direct.filter((document) => document.kind !== "PHOTO").length, photos: direct.filter((document) => document.kind === "PHOTO").length },
      last,
    };
  });
}

/** The requests and jobs whose site this is (they keep the address of the day they were assigned). */
export function assignedHere(dossier: CustomerDossierModel, siteId: string): Array<{ kind: "REQUEST" | "JOB"; label: string }> {
  return dossier.siteAssignments
    .filter((item) => item.siteId === siteId)
    .map((item) => {
      const targets = item.subjectKind === "REQUEST" ? dossier.linkTargets.requests : dossier.linkTargets.jobs;
      return { kind: item.subjectKind, label: targets.find((target) => target.subjectId === item.subjectId)?.label ?? (item.subjectKind === "REQUEST" ? "o cerere" : "o lucrare") };
    });
}

// ─── Editing a site and its version conflict (715:925 → 755:374 → 755:685 → 773:829) ───

export const SITE_FIELDS = ["name", "address", "city", "contactName", "phone", "accessNotes"] as const;
export type SiteField = (typeof SITE_FIELDS)[number];
export type SiteValues = Record<SiteField, string>;

export const SITE_FIELD_LABELS: Record<SiteField, string> = {
  name: "Denumire",
  address: "Adresă",
  city: "Localitate",
  contactName: "Persoană de contact",
  phone: "Telefon",
  accessNotes: "Observații acces / montaj",
};

export function siteValues(site: DossierSite | null): SiteValues {
  return {
    name: site?.name ?? "",
    address: site?.address ?? "",
    city: site?.city ?? "",
    contactName: site?.contactName ?? "",
    phone: site?.phone ?? "",
    accessNotes: site?.accessNotes ?? "",
  };
}

/** The fields to save: empty ones are cleared on the server (null), the text is sent as typed. */
export function sitePayload(values: SiteValues): Record<SiteField, string | null> {
  return Object.fromEntries(SITE_FIELDS.map((field) => [field, values[field].trim() ? values[field] : null])) as Record<SiteField, string | null>;
}

export type SiteConflictRow = DraftConflictRow<SiteField>;

/** Only the fields that differ between the reader's base, the draft and the current version. */
export function siteConflictRows(base: SiteValues, draft: SiteValues, current: SiteValues): SiteConflictRow[] {
  return draftConflictRows(SITE_FIELDS, base, draft, current);
}

/** Resume on the current version: the reader's changes stay; every other field is the current one. */
export function resumeSiteOnCurrent(base: SiteValues, draft: SiteValues, current: SiteValues): { values: SiteValues; kept: SiteField[]; taken: SiteField[] } {
  return resumeDraftOnCurrent(SITE_FIELDS, base, draft, current);
}
