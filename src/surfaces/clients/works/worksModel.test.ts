import { describe, expect, it } from "vitest";
import type { DossierDocument, WorkItem } from "../../../adapters/customerDossierAdapter";
import { EMPTY_LIST_CONTEXT } from "../dossier/listContext";
import { activeFilters, carried, listTrail, representativeNotice, totalsLine, workDate, workEyebrow, workImage } from "./worksModel";

const photo = (documentId: string, stage: string, stageLabel: string) =>
  ({ documentId, kind: "PHOTO", photoStage: stage, photoStageLabel: stageLabel, preview: "IMAGE", title: documentId, documentDate: null }) as unknown as DossierDocument;
const file = (documentId: string) => ({ documentId, kind: "INVOICE", photoStage: null, photoStageLabel: null, preview: "PDF", title: documentId }) as unknown as DossierDocument;
const work = (overrides: Partial<WorkItem>): WorkItem =>
  ({
    workId: "job:j1",
    provenance: "WORKOS",
    provenanceLabel: "În WorkOS",
    title: "Panou ACM casetat · ALPHA DEPOZIT",
    detail: null,
    reference: "OF-9B1C6A7E",
    eventDateLabel: "24 oct. 2026",
    year: 2026,
    state: "IN_PRODUCTIE",
    stateLabel: "Eliberată în producție",
    site: null,
    siteAtTimeLabel: null,
    description: null,
    job: { jobId: "j1", stageLabel: "x", progressLabel: null },
    request: { requestId: "r1", reference: "CER-4C3E1233", title: "x" },
    quote: { quoteSnapshotId: "q1", reference: "OF-9B1C6A7E" },
    historicalWorkId: null,
    documents: [],
    photoCount: 0,
    requestPhotos: null,
    representativePhoto: { revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null },
    matchedOn: [],
    ...overrides,
  }) as WorkItem;

describe("Lucrări · what a card says (N-020 etapa 4)", () => {
  it("tells two works of one request apart by their offer and request references (648:13594)", () => {
    const first = work({});
    const second = work({ workId: "job:j2", reference: "OF-E106A8EC", quote: { quoteSnapshotId: "q2", reference: "OF-E106A8EC" } });
    expect(workEyebrow(first)).toBe("În WorkOS · OF-9B1C6A7E · CER-4C3E1233");
    expect(workEyebrow(second)).toBe("În WorkOS · OF-E106A8EC · CER-4C3E1233");
    expect(workEyebrow(work({ provenance: "HISTORICAL_RECORD", provenanceLabel: "Înregistrare istorică", job: null, quote: null, request: null, reference: "AC-2021-014" }))).toBe("Înregistrare istorică · AC-2021-014");
  });

  it("uses the work's own photo; the request's only for a single work, said so; never for several works", () => {
    const own = workImage(work({ documents: [photo("p1", "AFTER", "După montaj")] }));
    expect(own).toMatchObject({ kind: "own", caption: "Imagine: după montaj" });
    const fromRequest = workImage(work({ requestPhotos: { requestId: "r1", photos: [photo("s1", "SIMULATION", "Simulare")], shared: false } }));
    expect(fromRequest).toMatchObject({ kind: "request", caption: "Imagine: simulare din cerere · nu e fotografia lucrării" });
    const shared = workImage(work({ requestPhotos: { requestId: "r1", photos: [photo("s1", "SIMULATION", "Simulare")], shared: true } }));
    expect(shared).toEqual({ kind: "shared", caption: "Fotografiile cererii sunt comune mai multor lucrări: nu sunt afișate aici" });
    expect(workImage(work({}))).toEqual({ kind: "none", caption: null });
  });

  it("shows the chosen photo first, with its real stage; a choice set aside falls back and is said once (N-021)", () => {
    const documents = [photo("after", "AFTER", "După montaj"), photo("sim", "SIMULATION", "Simulare")];
    const chosen = workImage(work({ documents, representativePhoto: { revision: 2, status: "MANUAL", documentId: "sim", invalidatedReason: null } }));
    expect(chosen).toMatchObject({ kind: "chosen", caption: "Imagine aleasă: simulare" });
    expect(chosen.kind === "chosen" ? chosen.photo.documentId : null).toBe("sim");
    expect(representativeNotice(work({ documents }))).toBeNull();
    // Invalidated or unavailable: the automatic rule (after) and a notice under it.
    const unlinked = work({ documents, representativePhoto: { revision: 3, status: "INVALIDATED", documentId: null, invalidatedReason: "UNLINKED" } });
    expect(workImage(unlinked)).toMatchObject({ kind: "own", caption: "Imagine: după montaj" });
    expect(representativeNotice(unlinked)).toBe("Fotografia aleasă a fost dezlegată de lucrare · se folosește alegerea automată");
    expect(representativeNotice(work({ representativePhoto: { revision: 3, status: "INVALIDATED", documentId: null, invalidatedReason: "NOT_A_PHOTO" } }))).toContain("nu mai este o fotografie");
    expect(representativeNotice(work({ representativePhoto: { revision: 1, status: "UNAVAILABLE", documentId: null, invalidatedReason: null } }))).toContain("nu mai este disponibilă");
    // A manual id the documents no longer carry never becomes the image.
    expect(workImage(work({ documents, representativePhoto: { revision: 1, status: "MANUAL", documentId: "gone", invalidatedReason: null } }))).toMatchObject({ kind: "own" });
    // Request photos are never the work's choice: the shared rule stays.
    const shared = work({ requestPhotos: { requestId: "r1", photos: [photo("s1", "SIMULATION", "Simulare")], shared: true }, representativePhoto: { revision: 1, status: "MANUAL", documentId: "s1", invalidatedReason: null } });
    expect(workImage(shared)).toMatchObject({ kind: "shared" });
  });

  it("counts documents apart from photos, and has nothing to open when there is neither", () => {
    expect(carried(work({ documents: [file("f1"), file("f2"), photo("p1", "AFTER", "După montaj")] })).label).toBe("2 documente · 1 fotografie");
    expect(carried(work({})).label).toBeNull();
  });

  it("dates a WorkOS work by its order and a record by its documented period", () => {
    expect(workDate(work({}))).toBe("comandată 24 oct. 2026");
    expect(workDate(work({ job: null, eventDateLabel: "iun. 2021 – iul. 2021" }))).toBe("iun. 2021 – iul. 2021");
  });

  it("names the totals, the active filters and the way back", () => {
    const totals = { all: 5, workos: 2, historical: 3 };
    expect(totalsLine(totals, false)).toBe("5 lucrări · 2 în WorkOS · 3 înregistrări istorice");
    expect(totalsLine(totals, true)).toBe("5 · 2 WorkOS · 3 istorice");
    const context = { ...EMPTY_LIST_CONTEXT, kind: "HISTORICAL", year: "2021", site: "s1" };
    const data = { facets: { sites: [{ siteId: "s1", name: "Depozit Ghimbav", active: true, count: 1 }], states: [], years: [], yearCounts: [] } } as never;
    expect(activeFilters(context, data)).toEqual(["Istorice", "An 2021", "Depozit Ghimbav"]);
    expect(listTrail(context)).toBe("Lucrări · Istorice · 2021");
    expect(listTrail(EMPTY_LIST_CONTEXT)).toBe("Lucrări");
  });
});
