import { describe, expect, it } from "vitest";
import type { CustomerDossierModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import { EMPTY_LIST_CONTEXT } from "../dossier/listContext";
import { activeDocumentFilters, buildDocumentsView, documentDateLabel, documentSites, linkHref, proofNote } from "./documentsModel";

const doc = (documentId: string, overrides: Partial<DossierDocument> = {}): DossierDocument => ({
  documentId,
  title: `Document ${documentId}`,
  kind: "INVOICE",
  kindLabel: "Factură",
  photoStage: null,
  photoStageLabel: null,
  documentNumber: `F-${documentId}`,
  documentDate: "2026-10-09",
  description: null,
  originalFileName: `${documentId}.pdf`,
  sizeBytes: 10_000,
  preview: "PDF",
  uploadedAt: "2026-10-24T10:00:00.000Z",
  revision: 1,
  links: [],
  viewHref: `/view/${documentId}`,
  downloadHref: `/download/${documentId}`,
  ...overrides,
});

const dossier = (documents: DossierDocument[]): CustomerDossierModel =>
  ({
    customerId: "c",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: {
      documentKinds: [
        { value: "CONTRACT", label: "Contract" },
        { value: "INVOICE", label: "Factură" },
        { value: "PHOTO", label: "Fotografie" },
        { value: "OTHER", label: "Alt document" },
      ],
      photoStages: [],
      historyStates: [],
      maxFileBytes: 1,
    },
    sites: [
      { siteId: "s-ghimbav", name: "Depozit Ghimbav", status: "ACTIVE" },
      { siteId: "s-show", name: "Showroom Str. Lungă", status: "ACTIVE" },
    ],
    siteAssignments: [{ subjectKind: "JOB", subjectId: "j1", siteId: "s-show" }],
    documents,
    historicalWorks: [{ workId: "h2021", title: "Litere 2021", eventDate: "2021-06", eventDateEnd: null, reference: "AC-2021-014", description: null, siteId: "s-ghimbav", revision: 1 }],
    linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  }) as unknown as CustomerDossierModel;

const invoice2021 = doc("f2021", { documentNumber: "F-ALC-2021-0412", documentDate: "2021-07-02", links: [{ kind: "HISTORICAL_WORK", kindLabel: "Lucrare istorică", subjectId: "h2021", label: "Litere 2021" }] });
const showroom = doc("fshow", { documentNumber: "F-ALC-2026-1342", links: [{ kind: "JOB", kindLabel: "Lucrare", subjectId: "j1", label: "Litere showroom" }, { kind: "SITE", kindLabel: "Sediu", subjectId: "s-show", label: "Showroom Str. Lungă" }] });
const undated = doc("letter", { kind: "OTHER", kindLabel: "Alt document", documentNumber: null, documentDate: null, uploadedAt: "2026-10-24T10:00:00.000Z" });
const photo = doc("p1", { kind: "PHOTO", kindLabel: "Fotografie" });
const all = dossier([invoice2021, showroom, undated, photo]);
const none = { ...EMPTY_LIST_CONTEXT };

describe("Documente · the list (670:16320)", () => {
  it("counts the files that are not photos, each once whatever its associations", () => {
    const view = buildDocumentsView(all, none);
    expect(view.total).toBe(3);
    expect(view.photoCount).toBe(1);
    expect(view.shown.map((item) => item.document.documentId)).toEqual(["letter", "fshow", "f2021"]);
  });

  it("keeps the date of the document apart from the upload: an undated one says so and stays at its upload year", () => {
    const view = buildDocumentsView(all, none);
    const letter = view.shown.find((item) => item.document.documentId === "letter")!;
    expect(letter.undated).toBe(true);
    expect(letter.year).toBe(2026);
    expect(documentDateLabel(letter.document)).toBe("fără dată");
    expect(view.groups.map((group) => [group.year, group.documents.length])).toEqual([[2026, 2], [2021, 1]]);
  });

  it("reads the site of a document from its links: the site, the job's assignment, the historical work", () => {
    expect(documentSites(showroom, all)).toEqual([{ siteId: "s-show", name: "Showroom Str. Lungă" }]);
    expect(documentSites(invoice2021, all)).toEqual([{ siteId: "s-ghimbav", name: "Depozit Ghimbav" }]);
    expect(documentSites(undated, all)).toEqual([]);
  });

  it("finds the 2021 invoice by its number and counts every option under the other filters", () => {
    const view = buildDocumentsView(all, { ...none, q: "f-alc-2021" });
    expect(view.shown.map((item) => item.document.documentId)).toEqual(["f2021"]);
    expect(view.total).toBe(3);
    expect(view.years).toEqual([{ value: "2026", label: "2026", count: 0 }, { value: "2021", label: "2021", count: 1 }]);
    expect(view.kinds.find((choice) => choice.value === "INVOICE")?.count).toBe(1);
    expect(view.kinds.some((choice) => choice.value === "PHOTO")).toBe(false);
  });

  it("combines Tip, An, Sediu and Asociere (AND), keeps an active choice at 0, and names the filters", () => {
    const view = buildDocumentsView(all, { ...none, kind: "CONTRACT", site: "s-ghimbav" });
    expect(view.shown).toEqual([]);
    expect(view.kinds.find((choice) => choice.value === "CONTRACT")?.count).toBe(0);
    expect(activeDocumentFilters(view, { ...none, kind: "CONTRACT", site: "s-ghimbav" })).toEqual(["Tip: Contract", "Depozit Ghimbav"]);
    expect(buildDocumentsView(all, { ...none, linked: "NONE" }).shown.map((item) => item.document.documentId)).toEqual(["letter"]);
    expect(buildDocumentsView(all, { ...none, linked: "HISTORICAL_WORK", year: "2021" }).shown.map((item) => item.document.documentId)).toEqual(["f2021"]);
  });

  it("opens with several kinds at once (Date comerciale → Contract, Act adițional) and names them", () => {
    const contract = doc("c1", { kind: "CONTRACT", kindLabel: "Contract" });
    const both = dossier([invoice2021, contract, undated]);
    const context = { ...none, kind: "CONTRACT,OTHER" };
    const view = buildDocumentsView(both, context);
    expect(view.shown.map((item) => item.document.documentId).sort()).toEqual(["c1", "letter"]);
    // The combined choice is one option of Tip, so the controls show it active and remove it whole.
    expect(view.kinds[0]).toEqual({ value: "CONTRACT,OTHER", label: "Contract, Alt document", count: 2 });
    expect(view.kinds.filter((choice) => choice.value.includes(","))).toHaveLength(1);
    expect(activeDocumentFilters(view, context)).toEqual(["Tip: Contract, Alt document"]);
  });

  it("keeps the combined filter, at 0, when the client has none of those kinds", () => {
    const context = { ...none, kind: "CONTRACT,ADDENDUM" };
    const vocabulary = { ...all, vocabulary: { ...all.vocabulary, documentKinds: [...all.vocabulary.documentKinds, { value: "ADDENDUM", label: "Act adițional" }] } } as CustomerDossierModel;
    const view = buildDocumentsView(vocabulary, context);
    expect(view.shown).toEqual([]);
    expect(view.total).toBe(3);
    expect(view.filtered).toBe(true);
    expect(view.kinds[0]).toEqual({ value: "CONTRACT,ADDENDUM", label: "Contract, Act adițional", count: 0 });
    expect(activeDocumentFilters(view, context)).toEqual(["Tip: Contract, Act adițional"]);
  });

  it("never reads more from a file than its metadata: the note says what uploading does not prove", () => {
    expect(proofNote("INVOICE")).toBe("Fișierul încărcat nu dovedește încasarea.");
    expect(proofNote("CONTRACT")).toBe("Fișierul încărcat nu dovedește semnarea.");
    expect(proofNote("OTHER")).toBe("Fișierul încărcat nu dovedește validarea documentului.");
  });

  it("leads each association to its object", () => {
    expect(linkHref("c", { kind: "JOB", subjectId: "j1" })).toBe("/lucrari/j1");
    expect(linkHref("c", { kind: "HISTORICAL_WORK", subjectId: "h2021" })).toBe("/clienti/c?sectiune=lucrari&lucrare=h2021");
    expect(linkHref("c", { kind: "SITE", subjectId: "s-show" })).toBe("/clienti/c?sediu=s-show");
  });
});
