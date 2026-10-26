import { describe, expect, it } from "vitest";
import type { CustomerDossierModel, DossierDocument, HistoryEntry } from "../../../adapters/customerDossierAdapter";
import { EMPTY_LIST_CONTEXT } from "../dossier/listContext";
import { activePhotoFilters, buildPhotosView, photoKey, readPhotoKey } from "./photosModel";

const STAGES = { BEFORE: "Înainte", SIMULATION: "Simulare", AFTER: "După montaj" } as const;

const photo = (documentId: string, stage: keyof typeof STAGES, date: string, links: DossierDocument["links"] = []): DossierDocument => ({
  documentId,
  title: `Foto ${documentId}`,
  kind: "PHOTO",
  kindLabel: "Fotografie",
  photoStage: stage,
  photoStageLabel: STAGES[stage],
  documentNumber: null,
  documentDate: date,
  description: null,
  originalFileName: `${documentId}.jpg`,
  sizeBytes: 1000,
  preview: "IMAGE",
  uploadedAt: "2026-10-24T10:00:00.000Z",
  revision: 1,
  links,
  viewHref: `/v/${documentId}`,
  downloadHref: `/d/${documentId}`,
});

const req = (requestId: string, label: string) => ({ kind: "REQUEST", kindLabel: "Cerere", subjectId: requestId, label });
const site = { kind: "SITE", kindLabel: "Sediu", subjectId: "s1", label: "Depozit Ghimbav" };

// One photo is attached to two requests (both projects show it); one only to a site; one to nothing.
const shared = photo("shared", "BEFORE", "2026-10-20", [req("r1", "CER-1"), req("r2", "CER-2")]);
const sim = photo("sim", "SIMULATION", "2026-10-21", [req("r1", "CER-1")]);
const after = photo("after", "AFTER", "2026-10-25", [{ kind: "JOB", kindLabel: "Lucrare", subjectId: "j1", label: "Lucrare 1" }]);
const atSite = photo("site-only", "BEFORE", "2025-03-01", [site]);
const loose = photo("loose", "AFTER", "2024-05-01");
const old = photo("old", "AFTER", "2021-07-01", [{ kind: "HISTORICAL_WORK", kindLabel: "Lucrare istorică", subjectId: "h1", label: "Litere 2021" }]);

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  entryId: "e",
  kind: "PROJECT",
  title: "Proiect",
  reference: null,
  eventDateLabel: "",
  year: 2026,
  state: "OFERTARE",
  stateLabel: "Ofertare",
  provenance: "WORKOS",
  provenanceLabel: "WorkOS",
  site: null,
  siteAtTimeLabel: null,
  description: null,
  request: null,
  states: [],
  branches: [],
  historicalWorkId: null,
  documents: [],
  photoCount: 0,
  representativePhotoId: null,
  matchedOn: [],
  ...over,
});

const entries: HistoryEntry[] = [
  entry({ entryId: "p1", title: "Casetă depozit", request: { requestId: "r1", reference: "CER-1", title: "Casetă", statusLabel: "" }, site: { siteId: "s1", name: "Depozit Ghimbav", line: "", active: true }, branches: [{ branchId: "b1", state: "EXECUTIE", stateLabel: "Execuție", quote: null, orderSnapshotId: null, job: { jobId: "j1", stageLabel: "", progressLabel: null, productLabel: "", inscription: "" }, site: null }], documents: [after, sim, shared] }),
  entry({ entryId: "p2", title: "Litere recepție", request: { requestId: "r2", reference: "CER-2", title: "Litere", statusLabel: "" }, documents: [shared] }),
  entry({ entryId: "p3", title: "Mentenanță", request: { requestId: "r3", reference: "CER-3", title: "Mentenanță", statusLabel: "" }, documents: [] }),
  entry({ entryId: "document:site-only", kind: "DOCUMENT", title: "Fațadă depozit", year: 2025, provenance: "UPLOAD", documents: [atSite] }),
  entry({ entryId: "document:loose", kind: "DOCUMENT", title: "Fotografie fără asociere", year: 2024, provenance: "UPLOAD", documents: [loose] }),
  entry({ entryId: "h1", kind: "HISTORICAL_WORK", title: "Litere 2021", reference: "AC-2021-014", year: 2021, stateLabel: "Finalizată", provenance: "HISTORICAL_RECORD", historicalWorkId: "h1", documents: [old] }),
];

const dossier = {
  documents: [shared, sim, after, atSite, loose, old, { ...photo("pdf", "BEFORE", "2026-01-01"), kind: "INVOICE", photoStage: null, photoStageLabel: null }],
  sites: [{ siteId: "s1", name: "Depozit Ghimbav", status: "ACTIVE" }],
  siteAssignments: [],
  historicalWorks: [],
  vocabulary: { photoStages: Object.entries(STAGES).map(([value, label]) => ({ value, label })) },
} as unknown as CustomerDossierModel;

const view = (filters: Partial<typeof EMPTY_LIST_CONTEXT> = {}) => buildPhotosView("cus-1", dossier, entries, { ...EMPTY_LIST_CONTEXT, ...filters });

describe("photosModel · gallery (675:18371 · 679:18951)", () => {
  it("counts distinct photos: a photo in two groups is shown in both and counted once", () => {
    const all = view();
    expect(all.total).toBe(6);
    expect(all.documentCount).toBe(1);
    expect(all.groups.map((group) => group.key)).toEqual(["p1", "p2", "document:site-only", "document:loose", "h1"]);
    expect(all.groups.flatMap((group) => group.photos).length).toBe(7);
    // Filtered by the two requests' stage: the shared photo is in two groups, one photo found.
    const before = view({ stage: "BEFORE" });
    expect(before.shownGroups.map((group) => group.key)).toEqual(["p1", "p2", "document:site-only"]);
    expect(before.shownCount).toBe(2);
    expect(before.stages.find((choice) => choice.value === "BEFORE")?.count).toBe(2);
    expect(view({ linked: "REQUEST" }).shownCount).toBe(2);
    expect(view().links.find((choice) => choice.value === "REQUEST")?.count).toBe(2);
  });

  it("keeps the order of the work inside a group and says where each photo comes from, without an owner", () => {
    const [p1, p2] = view().groups;
    expect(p1!.photos.map((tile) => [tile.photo.documentId, tile.originLabel])).toEqual([
      ["shared", "din cerere"],
      ["sim", "din cerere"],
      ["after", "a lucrării"],
    ]);
    expect(p1!.photos[0]!.alsoIn).toEqual(["Litere recepție"]);
    expect(p2!.photos[0]!.alsoIn).toEqual(["Casetă depozit"]);
    expect(p1!.open).toEqual({ href: expect.stringContaining("r1"), label: "Deschide cererea CER-1", short: "Deschide cererea" });
    expect(view().groups.at(-1)!.open?.label).toBe("Deschide înregistrarea AC-2021-014");
  });

  it("keeps the photos attached only to a site or only to the client, as their own groups", () => {
    const groups = view().groups;
    expect(groups.find((group) => group.key === "document:site-only")!.photos[0]!.originLabel).toBe("la sediu");
    expect(groups.find((group) => group.key === "document:loose")!.photos[0]!.originLabel).toBe("doar în dosarul clientului");
    expect(view({ site: "s1" }).shownGroups.map((group) => group.key)).toEqual(["p1", "document:site-only"]);
    expect(view({ linked: "NONE" }).shownCount).toBe(1);
  });

  it("reads An as the year of the photo, combines the filters with AND and keeps a chosen value at 0", () => {
    expect(view({ year: "2021" }).shownGroups.map((group) => group.key)).toEqual(["h1"]);
    expect(view({ year: "2026", stage: "AFTER" }).shownCount).toBe(1);
    const none = view({ year: "2019", stage: "AFTER" });
    expect(none.shownCount).toBe(0);
    expect(none.years.find((choice) => choice.value === "2019")).toEqual({ value: "2019", label: "2019", count: 0 });
    expect(activePhotoFilters(none, { year: "2019", site: "", stage: "AFTER", linked: "" })).toEqual(["2019", "După montaj"]);
    expect(view({ q: "receptie" }).shownGroups.map((group) => group.key)).toEqual(["p2"]);
  });

  it("names the projects without photos, never as not executed, and only without filters", () => {
    expect(view().withoutPhotos).toEqual(["Mentenanță (2026)"]);
    expect(view({ stage: "AFTER" }).withoutPhotos).toEqual([]);
  });

  it("writes the open photo in the address with its group", () => {
    expect(photoKey("p1", "shared")).toBe("p1|shared");
    expect(readPhotoKey("?sectiune=fotografii&fotografie=shared&grup=p2")).toEqual({ group: "p2", photo: "shared" });
    expect(readPhotoKey("?sectiune=fotografii")).toBeNull();
  });
});
