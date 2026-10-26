import { describe, expect, it } from "vitest";
import type { JobOverviewItem } from "../jobs/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import type { CustomerDocument, CustomerDocumentLink } from "./documents.js";
import { projectCustomerHistory, readCustomerHistoryQuery, type CustomerDocumentProjection, type CustomerHistoryInput } from "./history.js";
import { projectWorkRepresentativePhoto, readWorkRepresentativeRequest, workRepresentativeKey, type WorkRepresentativeSelection } from "./representativePhotos.js";
import { projectCustomerWorks, readCustomerWorksQuery } from "./works.js";

const photo = (documentId: string, kind: CustomerDocument["kind"] = "PHOTO"): CustomerDocumentProjection =>
  ({ documentId, kind, photoStage: kind === "PHOTO" ? "SIMULATION" : null }) as unknown as CustomerDocumentProjection;
const selection = (documentId: string | null, invalidated: WorkRepresentativeSelection["invalidated"] = null): WorkRepresentativeSelection => ({
  workKind: "JOB",
  workId: "j1",
  documentId,
  revision: 4,
  updatedAt: "2026-10-26T00:00:00.000Z",
  invalidated,
});

describe("N-021 · representative photo projection", () => {
  it("is automatic without a stored choice, manual only while the photo is one of the work's own", () => {
    expect(projectWorkRepresentativePhoto(undefined, [photo("p1")])).toEqual({ revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null, invalidatedAt: null });
    expect(projectWorkRepresentativePhoto(selection("p1"), [photo("p1")])).toMatchObject({ status: "MANUAL", documentId: "p1", revision: 4 });
    expect(projectWorkRepresentativePhoto(selection("p1"), [photo("p2")])).toMatchObject({ status: "UNAVAILABLE", documentId: null, revision: 4 });
    expect(projectWorkRepresentativePhoto(selection("p1"), [photo("p1", "INVOICE")])).toMatchObject({ status: "UNAVAILABLE", documentId: null });
    expect(projectWorkRepresentativePhoto(selection(null), [])).toMatchObject({ status: "AUTOMATIC", revision: 4 });
    expect(projectWorkRepresentativePhoto(selection(null, { documentId: "p1", reason: "UNLINKED", at: "t" }), [])).toMatchObject({ status: "INVALIDATED", invalidatedReason: "UNLINKED", invalidatedAt: "t" });
  });

  it("reads the request strictly and names the first invalid field", () => {
    expect(readWorkRepresentativeRequest({ workKind: "JOB", workId: "j1", documentId: null, expectedRevision: 0 })).toEqual({ ok: true, request: { workKind: "JOB", workId: "j1", documentId: null, expectedRevision: 0 } });
    expect(readWorkRepresentativeRequest({ workKind: "REQUEST", workId: "r", documentId: null, expectedRevision: 0 })).toEqual({ ok: false, field: "workKind" });
    expect(readWorkRepresentativeRequest({ workKind: "JOB", workId: "j1", expectedRevision: 0 })).toEqual({ ok: false, field: "documentId" });
    expect(readWorkRepresentativeRequest({ workKind: "JOB", workId: "j1", documentId: "p", expectedRevision: 1.5 })).toEqual({ ok: false, field: "expectedRevision" });
    expect(readWorkRepresentativeRequest(null)).toEqual({ ok: false, field: "workKind" });
  });

  it("gives a project the choice of its only job, never of one among several", () => {
    const request = (requestId: string) => ({ requestId, reference: `CER-${requestId}`, customerId: "c", title: `Cerere ${requestId}`, createdAt: "2026-10-01T08:00:00.000Z", status: "NEW", statusLabel: "Nouă" }) as unknown as RequestOverviewItem;
    const job = (jobId: string, requestId: string) => ({ jobId, requestId, orderSnapshotId: `o-${jobId}`, stage: "ORDER_CREATED", stageLabel: "x", productLabel: "Litere", inscription: jobId, progressLabel: null, createdAt: "2026-10-03T08:00:00.000Z" }) as unknown as JobOverviewItem;
    const document = (documentId: string): CustomerDocument => ({ documentId, customerId: "c", kind: "PHOTO", photoStage: "AFTER", title: documentId, documentNumber: null, documentDate: null, description: null, originalFileName: `${documentId}.png`, mimeType: "image/png", sizeBytes: 1, sha256: "x", storageKey: documentId, uploadedAt: "2026-10-23T00:00:00.000Z", uploadedByAccountId: "a", revision: 1 });
    const link = (subjectId: string): CustomerDocumentLink => ({ kind: "JOB", subjectId, linkedAt: "t" });
    const chosen = (workId: string, documentId: string): [string, WorkRepresentativeSelection] => [workRepresentativeKey("JOB", workId), { workKind: "JOB", workId, documentId, revision: 1, updatedAt: "t", invalidated: null }];
    const input: CustomerHistoryInput = {
      requests: [request("single"), request("double")],
      quotes: [],
      jobs: [job("j1", "single"), job("j2", "double"), job("j3", "double")],
      historicalWorks: [],
      documents: [document("p1"), document("p2"), document("p3")],
      documentLinks: new Map([["p1", [link("j1")]], ["p2", [link("j2")]], ["p3", [link("j3")]]]),
      sites: [],
      siteAssignments: [],
      representativePhotos: new Map([chosen("j1", "p1"), chosen("j2", "p2")]),
      documentContentHref: (id) => `/doc/${id}`,
    };
    const entries = projectCustomerHistory(input, readCustomerHistoryQuery({})).entries;
    expect(entries.find((entry) => entry.request?.requestId === "single")?.representativePhotoId).toBe("p1");
    expect(entries.find((entry) => entry.request?.requestId === "double")?.representativePhotoId).toBeNull();
    const works = projectCustomerWorks(input, readCustomerWorksQuery({})).items;
    expect(works.find((item) => item.workId === "job:j2")?.representativePhoto).toMatchObject({ status: "MANUAL", documentId: "p2" });
    expect(works.find((item) => item.workId === "job:j3")?.representativePhoto).toMatchObject({ status: "AUTOMATIC" });
  });
});
