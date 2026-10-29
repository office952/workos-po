import { describe, expect, it } from "vitest";
import type { DossierDocument, HistoryEntry } from "../../../adapters/customerDossierAdapter";
import { branchDocuments, groupByYear, isIllustrative, orderedPhotos, presentedStateLabel, relationSummary, representativePhoto, requestDocuments } from "./historyModel";

const doc = (documentId: string, over: Partial<DossierDocument>): DossierDocument => ({
  documentId,
  title: documentId,
  kind: "PHOTO",
  kindLabel: "Fotografie",
  photoStage: null,
  photoStageLabel: null,
  documentNumber: null,
  documentDate: "2026-10-01",
  description: null,
  originalFileName: `${documentId}.png`,
  sizeBytes: 1,
  preview: "IMAGE",
  uploadedAt: "2026-10-01T00:00:00.000Z",
  revision: 1,
  links: [],
  viewHref: `/v/${documentId}`,
  downloadHref: `/d/${documentId}`,
  ...over,
});

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  entryId: "e",
  kind: "PROJECT",
  title: "Proiect",
  reference: null,
  eventDateLabel: "",
  year: 2026,
  state: null,
  stateLabel: "",
  provenance: "WORKOS",
  provenanceLabel: "",
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

describe("history presentation model", () => {
  const before = doc("before", { photoStage: "BEFORE", documentDate: "2026-09-29" });
  const sim = doc("sim", { photoStage: "SIMULATION", documentDate: "2026-09-30" });
  const after = doc("after", { photoStage: "AFTER", documentDate: "2026-10-07" });
  const invoice = doc("invoice", { kind: "INVOICE", preview: "PDF", photoStage: null });

  it("orders photos before → simulation → after, whatever the upload order", () => {
    expect(orderedPhotos([after, invoice, sim, before]).map((item) => item.documentId)).toEqual(["before", "sim", "after"]);
  });

  it("represents an entry by the photo after mounting, else the simulation, else before", () => {
    expect(representativePhoto([before, sim, after])?.documentId).toBe("after");
    expect(representativePhoto([before, sim])?.documentId).toBe("sim");
    expect(representativePhoto([before])?.documentId).toBe("before");
    expect(representativePhoto([invoice])).toBeNull();
  });

  it("reads the illustrative provenance declared on the document", () => {
    expect(isIllustrative(doc("x", { description: "Imagine ilustrativă, generată pentru demonstrație" }))).toBe(true);
    expect(isIllustrative(doc("y", { description: "Fotografie de la montaj" }))).toBe(false);
  });

  it("puts each job's files on its branch and the rest on the request", () => {
    const jobFile = doc("pv", { kind: "RECEPTION", links: [{ kind: "JOB", subjectId: "j2", kindLabel: "Lucrare", label: "" }] });
    const requestPhoto = doc("survey", { photoStage: "BEFORE", links: [{ kind: "REQUEST", subjectId: "r", kindLabel: "Cerere", label: "" }] });
    const project = entry({
      documents: [jobFile, requestPhoto],
      branches: [
        { branchId: "q1", state: "OFERTARE", stateLabel: "Ofertare", quote: { quoteSnapshotId: "q1", kind: "PRODUCT", productCode: "P", reference: "OF-1", stageLabel: "", superseded: false }, orderSnapshotId: null, job: null, site: null },
        { branchId: "j2", state: "FINALIZAT", stateLabel: "Finalizată", quote: { quoteSnapshotId: "q2", kind: "PRODUCT", productCode: "P", reference: "OF-2", stageLabel: "", superseded: false }, orderSnapshotId: "o2", job: { jobId: "j2", stageLabel: "", progressLabel: null, productLabel: "", inscription: "" }, site: null },
      ],
    });
    expect(branchDocuments(project, project.branches[1]!).map((item) => item.documentId)).toEqual(["pv"]);
    expect(branchDocuments(project, project.branches[0]!)).toEqual([]);
    expect(requestDocuments(project).map((item) => item.documentId)).toEqual(["survey"]);
    expect(relationSummary(project)).toBe("Cerere → 2 oferte → 1 lucrare");
    expect(relationSummary(entry({ branches: [project.branches[0]!] }))).toBe("Cerere → 1 ofertă → fără lucrare încă");
  });

  it("says De ofertat only while a request still has no quote", () => {
    const quoteBranch = {
      branchId: "q1",
      state: "OFERTARE",
      stateLabel: "Ofertare",
      quote: { quoteSnapshotId: "q1", kind: "PRODUCT" as const, productCode: "P", reference: "OF-1", stageLabel: "Creată", superseded: false },
      orderSnapshotId: null,
      job: null,
      site: null,
    };
    const secondQuote = { ...quoteBranch, branchId: "q2", quote: { ...quoteBranch.quote, quoteSnapshotId: "q2", reference: "OF-2" } };
    const accepted = { ...quoteBranch, state: "OFERTA_ACCEPTATA", stateLabel: "Ofertă acceptată, fără comandă", quote: { ...quoteBranch.quote, stageLabel: "Acceptată" } };
    const waiting = entry({ state: "OFERTARE", stateLabel: "Ofertare", states: ["OFERTARE"], request: { requestId: "r", reference: "CER", title: "Fără ofertă", statusLabel: "Deschisă" } });
    const undecided = entry({ ...waiting, title: "Produs neales" });
    expect(presentedStateLabel(waiting)).toBe("De ofertat");
    expect(presentedStateLabel(undecided)).toBe("De ofertat");
    expect(presentedStateLabel(entry({ state: "OFERTARE", stateLabel: "Ofertare", branches: [quoteBranch] }))).toBe("Ofertare");
    expect(presentedStateLabel(entry({ state: "OFERTARE", stateLabel: "Ofertare", branches: [quoteBranch, secondQuote] }))).toBe("Ofertare");
    expect(presentedStateLabel(entry({ state: "OFERTA_ACCEPTATA", stateLabel: "Ofertă acceptată, fără comandă", branches: [accepted] }))).toBe("Ofertă acceptată, fără comandă");
    expect(presentedStateLabel(entry({ state: null, stateLabel: "Ramuri în stări diferite", branches: [quoteBranch, { ...quoteBranch, branchId: "j", state: "FINALIZAT", stateLabel: "Finalizată" }] }))).toBe("Ramuri în stări diferite");
    expect(presentedStateLabel(entry({ kind: "HISTORICAL_WORK", state: "FINALIZAT", stateLabel: "Finalizată" }))).toBe("Finalizată");
  });

  it("groups by year without reordering the server order", () => {
    const groups = groupByYear([{ year: 2026 }, { year: 2026 }, { year: 2025 }, { year: 2021 }]);
    expect(groups.map((group) => [group.year, group.entries.length])).toEqual([[2026, 2], [2025, 1], [2021, 1]]);
  });
});
