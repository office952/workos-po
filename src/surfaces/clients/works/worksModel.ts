import type { CustomerWorksModel, DossierDocument, WorkItem } from "../../../adapters/customerDossierAdapter";
import { attachedFiles, countLabel, representativePhoto } from "../dossier/historyModel";
import type { ListContext } from "../dossier/listContext";
import { invalidationText } from "../photos/representativeModel";

/**
 * N-020 etapa 4 · Lucrări (Figma 644:12426 · 644:12878 · 644:13352 · 648:13642 · 648:13594).
 * Presentation only: every word, count, state and date is the server's (`/works`); this file
 * names them for the card and the toolbar and never decides what a work is or where it belongs.
 */

export const PROVENANCE_OPTIONS = [
  { value: "", label: "Toate", short: "Toate" },
  { value: "WORKOS", label: "În WorkOS", short: "WorkOS" },
  { value: "HISTORICAL", label: "Istorice", short: "Istorice" },
] as const;

export function provenanceCount(totals: CustomerWorksModel["totals"], value: string): number {
  return value === "WORKOS" ? totals.workos : value === "HISTORICAL" ? totals.historical : totals.all;
}

/** "5 lucrări · 2 în WorkOS · 3 înregistrări istorice" (desktop) or "5 · 2 WorkOS · 3 istorice" (phone). */
export function totalsLine(totals: CustomerWorksModel["totals"], short: boolean): string {
  return short
    ? `${totals.all} · ${totals.workos} WorkOS · ${totals.historical} istorice`
    : `${countLabel(totals.all, "lucrare", "lucrări")} · ${totals.workos} în WorkOS · ${countLabel(totals.historical, "înregistrare istorică", "înregistrări istorice")}`;
}

/**
 * The active filters in words, in the order of the toolbar: "Istorice · An 2021 · Depozit Ghimbav
 * · Finalizată". A site or state the server no longer offers keeps a neutral word.
 */
export function activeFilters(context: ListContext, data: CustomerWorksModel | null): string[] {
  const kind = PROVENANCE_OPTIONS.find((option) => option.value && option.value === context.kind)?.label ?? null;
  const site = context.site ? data?.facets.sites.find((item) => item.siteId === context.site)?.name ?? "sediu indisponibil" : null;
  const state = context.state ? data?.facets.states.find((item) => item.state === context.state)?.label ?? "stare indisponibilă" : null;
  return [kind, context.year ? `An ${context.year}` : null, site, state].filter((value): value is string => Boolean(value));
}

/** The way back from a record: "Lucrări · Istorice · 2021" — the list it was opened from. */
export function listTrail(context: ListContext): string {
  const kind = context.kind === "HISTORICAL" ? "Istorice" : context.kind === "WORKOS" ? "În WorkOS" : null;
  return ["Lucrări", kind, context.year || null].filter(Boolean).join(" · ");
}

/** A WorkOS work is dated by its order becoming a job ("comandată …"); a record by its documented period. */
export function workDate(item: WorkItem): string {
  return item.job ? `comandată ${item.eventDateLabel}` : item.eventDateLabel;
}

/** What the card carries, from the documents the server attached: files apart from photos. */
export function carried(item: WorkItem): { files: DossierDocument[]; photos: DossierDocument[]; label: string | null } {
  const files = attachedFiles(item.documents);
  const photos = item.documents.filter((document) => document.kind === "PHOTO");
  const label = files.length || photos.length ? `${countLabel(files.length, "document", "documente")} · ${countLabel(photos.length, "fotografie", "fotografii")}` : null;
  return { files, photos, label };
}

export type WorkImage =
  | { kind: "chosen"; photo: DossierDocument; caption: string }
  | { kind: "own"; photo: DossierDocument; caption: string }
  | { kind: "request"; photo: DossierDocument; caption: string }
  | { kind: "shared"; caption: string }
  | { kind: "none"; caption: null };

/**
 * The image of a card: first the photo an operator chose for the work (N-021), when the server
 * still finds it among the work's own photos — named by its real stage, so a chosen simulation stays
 * a simulation; then (GO 12 rule, unchanged) the work's own representative photo by the automatic
 * rule; without one, the photo of its request only when the request has this single work — marked
 * as coming from the request, never as the work's; when the request has several works its photos
 * are not shown here. Nothing is assigned to the work.
 */
export function workImage(item: WorkItem): WorkImage {
  const chosenId = item.representativePhoto.status === "MANUAL" ? item.representativePhoto.documentId : null;
  const chosen = chosenId ? item.documents.find((document) => document.documentId === chosenId && document.kind === "PHOTO") : undefined;
  if (chosen) return { kind: "chosen", photo: chosen, caption: `Imagine aleasă: ${(chosen.photoStageLabel ?? "fotografie").toLocaleLowerCase("ro")}` };
  const own = representativePhoto(item.documents);
  if (own) return { kind: "own", photo: own, caption: `Imagine: ${(own.photoStageLabel ?? "fotografie").toLocaleLowerCase("ro")}` };
  const context = item.requestPhotos && !item.requestPhotos.shared ? representativePhoto(item.requestPhotos.photos) : null;
  if (context) return { kind: "request", photo: context, caption: `Imagine: ${(context.photoStageLabel ?? "fotografie").toLocaleLowerCase("ro")} din cerere · nu e fotografia lucrării` };
  if (item.requestPhotos?.shared) return { kind: "shared", caption: "Fotografiile cererii sunt comune mai multor lucrări: nu sunt afișate aici" };
  return { kind: "none", caption: null };
}

/**
 * N-021 · a choice the server set aside (the photo was unlinked from the work or stopped being a
 * photo, or is no longer found): said once under the image the automatic rule now shows.
 */
export function representativeNotice(item: WorkItem): string | null {
  const { status, invalidatedReason } = item.representativePhoto;
  if (status === "INVALIDATED") return invalidationText(invalidatedReason);
  if (status === "UNAVAILABLE") return "Fotografia aleasă nu mai este disponibilă · se folosește alegerea automată";
  return null;
}

/**
 * The eyebrow that tells two works apart (648:13594): where it comes from, then the references the
 * server gives — the offer and the request for a WorkOS work, the record's own reference otherwise.
 */
export function workEyebrow(item: WorkItem): string {
  const provenance = item.provenance === "HISTORICAL_RECORD" ? item.provenanceLabel || "Înregistrare istorică" : "În WorkOS";
  const references = item.job ? [item.quote?.reference ?? item.reference, item.request?.reference] : [item.reference];
  return [provenance, ...references].filter(Boolean).join(" · ");
}

/** The state with the job's own progress words, as the server writes them. */
export function stateText(item: WorkItem): string {
  return item.job?.progressLabel ? `${item.stateLabel} · ${item.job.progressLabel}` : item.stateLabel;
}
