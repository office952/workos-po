import { describe, expect, it } from "vitest";
import type { CustomerDossierModel, CustomerWorksModel, DossierDocument, HistoryEntry } from "../../../adapters/customerDossierAdapter";
import { assignedHere, resumeSiteOnCurrent, siteConflictRows, sitePayload, siteValues, summarizeSites } from "./sitesModel";

const doc = (documentId: string, kind: string, links: DossierDocument["links"], over: Partial<DossierDocument> = {}): DossierDocument => ({
  documentId,
  title: documentId,
  kind,
  kindLabel: kind === "PHOTO" ? "Fotografie" : "Factură",
  photoStage: null,
  photoStageLabel: null,
  documentNumber: null,
  documentDate: "2026-10-01",
  description: null,
  originalFileName: `${documentId}.jpg`,
  sizeBytes: 10,
  preview: kind === "PHOTO" ? "IMAGE" : "PDF",
  uploadedAt: "2026-10-24T00:00:00.000Z",
  revision: 1,
  links,
  viewHref: `/v/${documentId}`,
  downloadHref: `/d/${documentId}`,
  ...over,
});
const site = (siteId: string, name: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") => ({ siteId, name, address: "Str. 1", city: "Brașov", contactName: null, phone: null, accessNotes: null, status, statusLabel: status === "ACTIVE" ? "Activ" : "Inactiv", revision: 3, usage: { requests: 1, jobs: 0, historicalWorks: 0, documents: 2 } });
const toSite = { kind: "SITE", kindLabel: "Sediu", subjectId: "s1", label: "Depozit" };
const toRequest = { kind: "REQUEST", kindLabel: "Cerere", subjectId: "r1", label: "CER-1" };

const before = doc("before", "PHOTO", [toRequest], { photoStage: "BEFORE", photoStageLabel: "Înainte", documentDate: "2026-09-01" });
const simulation = doc("sim", "PHOTO", [toRequest], { photoStage: "SIMULATION", photoStageLabel: "Simulare", documentDate: "2026-10-20" });
const atSite = doc("site-photo", "PHOTO", [toSite], { photoStage: "AFTER", photoStageLabel: "După montaj", documentDate: "2026-09-15" });
const invoice = doc("invoice", "INVOICE", [toSite]);

const dossier = {
  sites: [site("s1", "Depozit"), site("s2", "Showroom", "INACTIVE")],
  siteAssignments: [{ subjectKind: "REQUEST", subjectId: "r1", siteId: "s1" }],
  documents: [before, simulation, atSite, invoice],
  historicalWorks: [],
  linkTargets: { requests: [{ subjectId: "r1", label: "CER-1 · Casetă" }], jobs: [], historicalWorks: [], sites: [] },
  vocabulary: { documentKinds: [{ value: "INVOICE", label: "Factură" }, { value: "PHOTO", label: "Fotografie" }], photoStages: [{ value: "BEFORE", label: "Înainte" }, { value: "SIMULATION", label: "Simulare" }, { value: "AFTER", label: "După montaj" }] },
} as unknown as CustomerDossierModel;

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({ entryId: "e", kind: "PROJECT", title: "Proiect", reference: null, eventDateLabel: "23 oct. 2026", year: 2026, state: null, stateLabel: "", provenance: "WORKOS", provenanceLabel: "", site: null, siteAtTimeLabel: null, description: null, request: null, states: [], branches: [], historicalWorkId: null, documents: [], photoCount: 0, matchedOn: [], ...over });
const entries = [
  entry({ entryId: "p1", title: "Casetă depozit", site: { siteId: "s1", name: "Depozit", line: "", active: true }, request: { requestId: "r1", reference: "CER-1", title: "", statusLabel: "" }, documents: [before, simulation] }),
  entry({ entryId: "document:site-photo", kind: "DOCUMENT", title: "Fațadă", provenance: "UPLOAD", site: { siteId: "s1", name: "Depozit", line: "", active: true }, documents: [atSite] }),
];
const works = { facets: { sites: [{ siteId: "s1", name: "Depozit", active: true, count: 1 }, { siteId: "s2", name: "Showroom", active: false, count: 0 }] } } as unknown as CustomerWorksModel;

describe("sitesModel · site cards (759:451)", () => {
  it("counts what each destination shows, from the server's facets and the views' own rules", () => {
    const [depot, showroom] = summarizeSites("cus-1", dossier, { entries, sites: [{ siteId: "s1", count: 2 }, { siteId: "s2", count: 0 }] }, works);
    expect(depot!.destinations.map((item) => [item.label, item.count, item.href])).toEqual([
      ["Istoric", 2, "/clienti/cus-1?sediu=s1"],
      ["Lucrări", 1, "/clienti/cus-1?sectiune=lucrari&sediu=s1"],
      ["Documente", 1, "/clienti/cus-1?sectiune=documente&sediu=s1"],
      ["Fotografii", 3, "/clienti/cus-1?sectiune=fotografii&sediu=s1"],
    ]);
    // Only the files linked to the site itself, photos apart from documents.
    expect(depot!.direct).toEqual({ documents: 1, photos: 1 });
    expect(depot!.last?.title).toBe("Casetă depozit");
    expect(showroom!.destinations.map((item) => item.count)).toEqual([0, 0, 0, 0]);
    expect(showroom!.photo).toBeNull();
  });

  it("never takes a simulation as the site's photo; the newest before or after is taken", () => {
    const [depot] = summarizeSites("cus-1", dossier, { entries, sites: [{ siteId: "s1", count: 2 }] }, works);
    expect(depot!.photo?.document.documentId).toBe("site-photo");
    expect(depot!.photo?.group.key).toBe("document:site-photo");
  });

  it("leaves out a number it cannot know yet, and the last entry when its list disagrees with the server", () => {
    const [unread] = summarizeSites("cus-1", dossier, null, null);
    expect(unread!.destinations.map((item) => item.count)).toEqual([null, null, 1, null]);
    const [mismatch] = summarizeSites("cus-1", dossier, { entries, sites: [{ siteId: "s1", count: 3 }] }, works);
    expect(mismatch!.last).toBeNull();
  });

  it("names the requests and jobs that keep this site", () => {
    expect(assignedHere(dossier, "s1")).toEqual([{ kind: "REQUEST", label: "CER-1 · Casetă" }]);
    expect(assignedHere(dossier, "s2")).toEqual([]);
  });
});

describe("sitesModel · version conflict (755:374 → 755:685 → 773:829)", () => {
  const base = siteValues(site("s1", "Depozit"));
  const draft = { ...base, contactName: "Radu Pavel", phone: "0700 900 131" };
  const current = { ...base, accessNotes: "Acces pe poarta 3." };

  it("compares only the fields that differ, saying who changed each", () => {
    expect(siteConflictRows(base, draft, current).map((row) => [row.field, row.mineChanged, row.currentChanged])).toEqual([
      ["contactName", true, false],
      ["phone", true, false],
      ["accessNotes", false, true],
    ]);
  });

  it("resumes on the current version with the reader's changes kept and the others taken", () => {
    const next = resumeSiteOnCurrent(base, draft, current);
    expect(next.values).toEqual({ ...current, contactName: "Radu Pavel", phone: "0700 900 131" });
    expect(next.kept).toEqual(["contactName", "phone"]);
    expect(next.taken).toEqual(["accessNotes"]);
  });

  it("sends an empty field as cleared", () => {
    expect(sitePayload({ ...base, phone: "  " }).phone).toBeNull();
  });
});
