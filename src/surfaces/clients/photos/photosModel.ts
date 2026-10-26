import type { CustomerDossierModel, DossierDocument, HistoryEntry } from "../../../adapters/customerDossierAdapter";
import { jobHref, requestHref } from "../../../routing/appRoute";
import { documentSites, documentYear, LINK_FILTERS, type DocumentChoice, type SiteRef } from "../documents/documentsModel";
import { orderedPhotos } from "../dossier/historyModel";
import { clientListHref, EMPTY_LIST_CONTEXT, type ListContext } from "../dossier/listContext";

/**
 * N-020 etapa 6 · Fotografii (Figma 675:17860 · 675:18371 · 675:18640 · 707:21500 · 707:21048 ·
 * 677:18467 · 679:18951 · 679:18994). Presentation over what the server sent: a photo is a document
 * of kind PHOTO; its groups are the history entries the server put it in (a project through its
 * request or jobs, a historical work, or an entry of its own when it is attached to no request, job
 * or work). A photo attached to two objects is shown in each of their groups and counted once: every
 * number here counts distinct documentId. No group is made the photo's "main" owner.
 */

const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type PhotoFilters = Pick<ListContext, "q" | "year" | "site" | "stage" | "linked">;

/** Where a photo sits inside its group: the request's images apart from the work's photos. */
export type PhotoOrigin = "REQUEST" | "WORK" | "REQUEST_AND_WORK" | "SITE" | "CLIENT";

export type PhotoTile = { photo: DossierDocument; origin: PhotoOrigin; originLabel: string; sites: SiteRef[]; year: number; alsoIn: string[] };

export type PhotoGroup = {
  entry: HistoryEntry;
  key: string;
  /** All the photos of the group, in the order of the work (before → simulation → after, then date). */
  photos: PhotoTile[];
  /** The photos of the group that pass the search and the filters, in the same order. */
  shown: PhotoTile[];
  siteIds: string[];
  /** What the group is: "proiect 2026 · ofertare", "lucrare istorică 2021 · finalizată", "încărcată 2026". */
  meta: string;
  open: { href: string; label: string; short: string } | null;
};

export type PhotosView = {
  /** All the photos of the client, each once. */
  total: number;
  documentCount: number;
  groups: PhotoGroup[];
  /** The groups that still have a photo under the search and the filters. */
  shownGroups: PhotoGroup[];
  /** Distinct photos shown (a photo in two groups counts once). */
  shownCount: number;
  filtered: boolean;
  /** Projects and historical works without any photo: named, never read as "not executed". */
  withoutPhotos: string[];
  years: DocumentChoice[];
  sites: DocumentChoice[];
  stages: DocumentChoice[];
  links: DocumentChoice[];
};

/** "Asociere" for photos: next to the Sediu filter, a direct site link is said as such. */
const PHOTO_LINK_LABEL: Record<string, string> = { SITE: "Asociate direct unui sediu" };

/** The words for where a photo comes from, as on the tiles of 675:18371. */
export const ORIGIN_LABEL: Record<PhotoOrigin, string> = {
  REQUEST: "din cerere",
  WORK: "a lucrării",
  REQUEST_AND_WORK: "din cerere · a lucrării",
  SITE: "la sediu",
  CLIENT: "doar în dosarul clientului",
};

function originOf(entry: HistoryEntry, photo: DossierDocument): PhotoOrigin {
  const linked = (kind: string, id: string | null | undefined) => Boolean(id) && photo.links.some((link) => link.kind === kind && link.subjectId === id);
  if (entry.kind === "HISTORICAL_WORK") return "WORK";
  if (entry.kind === "PROJECT") {
    const fromRequest = linked("REQUEST", entry.request?.requestId);
    const fromWork = entry.branches.some((branch) => linked("JOB", branch.job?.jobId));
    if (fromRequest && fromWork) return "REQUEST_AND_WORK";
    return fromWork ? "WORK" : "REQUEST";
  }
  return photo.links.some((link) => link.kind === "SITE") ? "SITE" : "CLIENT";
}

function groupMeta(entry: HistoryEntry): string {
  const kind = entry.kind === "PROJECT" ? `proiect ${entry.year}` : entry.kind === "HISTORICAL_WORK" ? `lucrare istorică ${entry.year}` : `încărcată ${entry.year}`;
  const state = entry.kind === "DOCUMENT" ? null : entry.stateLabel ? entry.stateLabel.toLocaleLowerCase("ro") : null;
  return [kind, state].filter(Boolean).join(" · ");
}

/** Where the group leads (675:17860): the request, the historical record, the work, else the history entry. */
function groupOpen(customerId: string, entry: HistoryEntry): PhotoGroup["open"] {
  if (entry.kind === "PROJECT" && entry.request) return { href: requestHref(entry.request.requestId), label: `Deschide cererea ${entry.request.reference}`, short: "Deschide cererea" };
  if (entry.kind === "PROJECT") {
    const job = entry.branches.find((branch) => branch.job)?.job;
    return job ? { href: jobHref(job.jobId), label: "Deschide lucrarea", short: "Deschide lucrarea" } : null;
  }
  if (entry.kind === "HISTORICAL_WORK" && entry.historicalWorkId) {
    return { href: clientListHref(customerId, "lucrari", EMPTY_LIST_CONTEXT, { lucrare: entry.historicalWorkId }), label: `Deschide înregistrarea ${entry.reference ?? ""}`.trim(), short: "Deschide înregistrarea" };
  }
  return { href: clientListHref(customerId, "istoric", EMPTY_LIST_CONTEXT, { deschis: entry.entryId }), label: "Vezi în Istoric", short: "Vezi în Istoric" };
}

function entrySites(entry: HistoryEntry): string[] {
  return [entry.site?.siteId, ...entry.branches.map((branch) => branch.site?.siteId)].filter((id): id is string => Boolean(id));
}

/**
 * The gallery: groups in the server's order (newest first, never reordered to fill the grid),
 * search and An / Sediu / Etapă / Asociere combined with AND. An is the year of the photo (its date,
 * else the day it was uploaded); Sediu matches the site of the group or a site the photo is attached
 * to; Etapă is the declared stage; Asociere is what the photo is attached to. Every count is a count
 * of distinct photos; an active choice that no longer exists stays, at 0.
 */
export function buildPhotosView(customerId: string, dossier: CustomerDossierModel, entries: readonly HistoryEntry[], filters: PhotoFilters): PhotosView {
  const photos = dossier.documents.filter((document) => document.kind === "PHOTO");
  const byId = new Map(photos.map((photo) => [photo.documentId, photo]));
  const raw = entries
    .map((entry) => ({ entry, list: orderedPhotos(entry.documents).map((photo) => byId.get(photo.documentId) ?? photo) }))
    .filter((group) => group.list.length > 0);
  // Which groups each photo is shown in, to say "also in …" without choosing an owner.
  const groupsOf = new Map<string, string[]>();
  for (const { entry, list } of raw) for (const photo of list) groupsOf.set(photo.documentId, [...(groupsOf.get(photo.documentId) ?? []), entry.title]);

  const needle = plain(filters.q.trim());
  type Skip = "year" | "site" | "stage" | "linked" | null;
  const passes = (group: { entry: HistoryEntry; siteIds: string[] }, tile: PhotoTile, skip: Skip) =>
    (skip === "year" || !filters.year || String(tile.year) === filters.year) &&
    (skip === "site" || !filters.site || group.siteIds.includes(filters.site) || tile.sites.some((site) => site.siteId === filters.site)) &&
    (skip === "stage" || !filters.stage || tile.photo.photoStage === filters.stage) &&
    (skip === "linked" || !filters.linked || LINK_FILTERS.find((option) => option.value === filters.linked)?.test(tile.photo) !== false) &&
    (!needle ||
      plain(
        [tile.photo.title, tile.photo.description ?? "", tile.photo.photoStageLabel ?? "", group.entry.title, group.entry.reference ?? "", group.entry.request?.reference ?? "", group.entry.site?.name ?? "", ...tile.sites.map((site) => site.name), ...tile.photo.links.map((link) => link.label)].join(" "),
      ).includes(needle));

  const groups: PhotoGroup[] = raw.map(({ entry, list }) => {
    const siteIds = [...new Set(entrySites(entry))];
    const tiles = list.map((photo) => {
      const origin = originOf(entry, photo);
      return { photo, origin, originLabel: ORIGIN_LABEL[origin], sites: documentSites(photo, dossier), year: documentYear(photo), alsoIn: (groupsOf.get(photo.documentId) ?? []).filter((title) => title !== entry.title) };
    });
    const group = { entry, siteIds };
    return { entry, key: entry.entryId, photos: tiles, shown: tiles.filter((tile) => passes(group, tile, null)), siteIds, meta: groupMeta(entry), open: groupOpen(customerId, entry) };
  });
  const shownGroups = groups.filter((group) => group.shown.length > 0);
  const distinct = (test: (group: PhotoGroup, tile: PhotoTile) => boolean) => {
    const ids = new Set<string>();
    for (const group of groups) for (const tile of group.photos) if (test(group, tile)) ids.add(tile.photo.documentId);
    return ids.size;
  };
  const count = (skip: Exclude<Skip, null>, test: (group: PhotoGroup, tile: PhotoTile) => boolean) => distinct((group, tile) => passes(group, tile, skip) && test(group, tile));
  const keep = (choices: DocumentChoice[], value: string, label: string) => (value && !choices.some((choice) => choice.value === value) ? [...choices, { value, label, count: 0 }] : choices);
  const years = [...new Set(groups.flatMap((group) => group.photos.map((tile) => tile.year)))].sort((a, b) => b - a);
  const filtered = Boolean(filters.q || filters.year || filters.site || filters.stage || filters.linked);
  // The whole gallery, each photo once: the photos of the dossier and any the history shows besides.
  const all = new Set([...photos.map((photo) => photo.documentId), ...groups.flatMap((group) => group.photos.map((tile) => tile.photo.documentId))]);
  return {
    total: all.size,
    documentCount: dossier.documents.length - photos.length,
    groups,
    shownGroups,
    shownCount: distinct((group, tile) => group.shown.includes(tile)),
    filtered,
    withoutPhotos: filtered ? [] : entries.filter((entry) => entry.kind !== "DOCUMENT" && !entry.documents.some((document) => document.kind === "PHOTO")).map((entry) => `${entry.title} (${entry.year})`),
    years: keep(years.map((year) => ({ value: String(year), label: String(year), count: count("year", (_, tile) => tile.year === year) })), filters.year, filters.year),
    sites: keep(
      dossier.sites.map((site) => ({ value: site.siteId, label: site.status === "ACTIVE" ? site.name : `${site.name} (inactiv)`, count: count("site", (group, tile) => group.siteIds.includes(site.siteId) || tile.sites.some((ref) => ref.siteId === site.siteId)) })),
      filters.site,
      "Sediu indisponibil",
    ),
    stages: keep(dossier.vocabulary.photoStages.map((stage) => ({ value: stage.value, label: stage.label, count: count("stage", (_, tile) => tile.photo.photoStage === stage.value) })), filters.stage, "Etapă indisponibilă"),
    links: keep(LINK_FILTERS.map((option) => ({ value: option.value, label: PHOTO_LINK_LABEL[option.value] ?? option.label, count: count("linked", (_, tile) => option.test(tile.photo)) })), filters.linked, "Asociere indisponibilă"),
  };
}

/** The active filters in words: "Depozit Ghimbav · 2021 · Înainte · Cereri". */
export function activePhotoFilters(view: PhotosView, filters: Pick<PhotoFilters, "year" | "site" | "stage" | "linked">): string[] {
  const label = (choices: DocumentChoice[], value: string) => choices.find((choice) => choice.value === value)?.label ?? value;
  return [
    filters.site ? label(view.sites, filters.site) : null,
    filters.year ? filters.year : null,
    filters.stage ? label(view.stages, filters.stage) : null,
    filters.linked ? label(view.links, filters.linked) : null,
  ].filter((value): value is string => Boolean(value));
}

/** The open photo in the address: `fotografie=<documentId>` and the group it was opened in. */
export const PHOTO_PARAM = "fotografie";
export const PHOTO_GROUP_PARAM = "grup";
export const PHOTO_KEY_SEPARATOR = "|";

/** One open photo in one group: "group|photo" (also the key of its tile, to give the focus back). */
export function photoKey(groupKey: string, documentId: string): string {
  return `${groupKey}${PHOTO_KEY_SEPARATOR}${documentId}`;
}

export function readPhotoKey(search: string): { group: string | null; photo: string } | null {
  const params = new URLSearchParams(search);
  const photo = params.get(PHOTO_PARAM);
  return photo ? { group: params.get(PHOTO_GROUP_PARAM), photo } : null;
}
