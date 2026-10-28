import type { DossierDocument, HistoryBranch, HistoryEntry } from "../../../adapters/customerDossierAdapter";

/**
 * N-020 · presentation helpers of the vertical history. They only order, group and count what the
 * server projection already decided (entries, branches, states, documents and their links); no
 * commercial or production state is derived here.
 */

/** The order of photo stages inside a project: before (or survey) → simulation → after mounting. */
const STAGE_ORDER: Record<string, number> = { BEFORE: 0, SIMULATION: 1, AFTER: 2 };

const dateKey = (document: DossierDocument) => document.documentDate ?? document.uploadedAt;

export function isPhoto(document: DossierDocument): boolean {
  return document.kind === "PHOTO";
}

/** Photos of an entry in the order of the work: before → simulation → after, then by date. */
export function orderedPhotos(documents: readonly DossierDocument[]): DossierDocument[] {
  return documents
    .filter(isPhoto)
    .slice()
    .sort(
      (left, right) =>
        (STAGE_ORDER[left.photoStage ?? ""] ?? 9) - (STAGE_ORDER[right.photoStage ?? ""] ?? 9) ||
        dateKey(left).localeCompare(dateKey(right)) ||
        left.documentId.localeCompare(right.documentId),
    );
}

/**
 * The image that represents an entry when collapsed: the latest photo after mounting, else the
 * latest simulation, else the latest photo before. Its stage is shown on it, so a simulation is
 * never mistaken for the finished work.
 */
export function representativePhoto(documents: readonly DossierDocument[]): DossierDocument | null {
  const photos = documents.filter(isPhoto);
  for (const stage of ["AFTER", "SIMULATION", "BEFORE"]) {
    const latest = photos.filter((photo) => photo.photoStage === stage).sort((left, right) => dateKey(right).localeCompare(dateKey(left)))[0];
    if (latest) return latest;
  }
  return photos[0] ?? null;
}

/**
 * N-021 · the image of a history entry: the photo chosen for its work when the server says the entry
 * is that one work (a historical work, or a project with exactly one job), else the automatic rule.
 */
export function entryPhoto(entry: Pick<HistoryEntry, "documents" | "representativePhotoId">): DossierDocument | null {
  const chosen = entry.representativePhotoId ? entry.documents.find((document) => document.documentId === entry.representativePhotoId && isPhoto(document)) : undefined;
  return chosen ?? representativePhoto(entry.documents);
}

/**
 * "Ilustrativ" is the provenance of an image (generated or schematic, not a photo of a real
 * mounting). It is declared on the document itself, in its title or description; the dossier
 * schema has no separate flag.
 */
export function isIllustrative(document: DossierDocument): boolean {
  return /ilustrativ/i.test(`${document.title} ${document.description ?? ""}`);
}

/** Uploaded files that are not photos (contracts, invoices, reports…). */
export function attachedFiles(documents: readonly DossierDocument[]): DossierDocument[] {
  return documents.filter((document) => !isPhoto(document));
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function fileCountLabel(count: number): string {
  return count === 1 ? "1 fișier atașat" : `${count} fișiere atașate`;
}

export function offerCount(entry: HistoryEntry): number {
  return entry.branches.filter((branch) => branch.quote).length;
}

/** The documents attached to the job of one branch (the job's own files and photos). */
export function branchDocuments(entry: HistoryEntry, branch: HistoryBranch): DossierDocument[] {
  if (!branch.job) return [];
  const jobId = branch.job.jobId;
  return entry.documents.filter((document) => document.links.some((link) => link.kind === "JOB" && link.subjectId === jobId));
}

/** The documents of the request itself: every document of the entry not attached to one of its jobs. */
export function requestDocuments(entry: HistoryEntry): DossierDocument[] {
  const jobIds = new Set(entry.branches.flatMap((branch) => (branch.job ? [branch.job.jobId] : [])));
  return entry.documents.filter((document) => !document.links.some((link) => link.kind === "JOB" && jobIds.has(link.subjectId)));
}

/**
 * The badge of a history card. `OFERTARE` is one canonical stage for two facts the server already
 * separates: a quote that exists and is not yet accepted stays "Ofertare"; a request with no quote
 * on any branch is still waiting for that quote, so the card says "De ofertat". The state code and
 * the server label are left as they are. Mixed branches keep each branch's own label.
 */
export function presentedStateLabel(entry: HistoryEntry): string {
  const waitingForQuote =
    entry.kind === "PROJECT" && entry.state === "OFERTARE" && entry.branches.every((branch) => branch.quote === null);
  return waitingForQuote ? "De ofertat" : entry.stateLabel;
}

/** One line telling how a project went, from the relations the server returned. */
export function relationSummary(entry: HistoryEntry): string {
  if (entry.kind === "HISTORICAL_WORK") return "fără cerere sau ofertă în WorkOS";
  if (entry.kind === "DOCUMENT") return "document fără cerere sau lucrare";
  const offers = offerCount(entry);
  const jobs = entry.branches.filter((branch) => branch.job).length;
  const parts = ["Cerere", offers ? countLabel(offers, "ofertă", "oferte") : "fără ofertă"];
  parts.push(jobs ? countLabel(jobs, "lucrare", "lucrări") : "fără lucrare încă");
  return parts.join(" → ");
}

/** Groups entries (already ordered newest first by the server) by year, keeping that order. */
export function groupByYear<T extends { year: number }>(entries: readonly T[]): Array<{ year: number; entries: T[] }> {
  const groups: Array<{ year: number; entries: T[] }> = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.year === entry.year) last.entries.push(entry);
    else groups.push({ year: entry.year, entries: [entry] });
  }
  return groups;
}

/** A presentation tone for a canonical state: colour plus a symbol, never colour alone. */
export type StateTone = "offer" | "order" | "production" | "execution" | "done" | "neutral";

export function stateTone(state: string | null): StateTone {
  switch (state) {
    case "OFERTARE":
    case "OFERTA_ACCEPTATA":
      return "offer";
    case "COMANDA_CREATA":
      return "order";
    case "ELIBERATA":
    case "PLAN_PREGATIT":
      return "production";
    case "IN_EXECUTIE":
      return "execution";
    case "FINALIZAT":
      return "done";
    default:
      return "neutral";
  }
}

/** The label of a provenance value in the history filters (server labels win when present). */
export const PROVENANCE_NOTE: Record<string, string> = {
  UPLOAD: "fără cerere sau lucrare · fără stare",
};
