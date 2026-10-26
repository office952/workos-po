import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-021 · „Setează ca reprezentativă” from the „⋯” of a photo, through the server's routes (mocked):
 * the exact work is named when the photo belongs to several, the choice is saved with the revision
 * read, a conflict or an unavailable photo saves nothing and reads the dossier again, an error keeps
 * the chosen work, „Revino la alegerea automată” clears, and without the permission there is no action.
 */
type Reply = { status: number; body?: unknown };
const reply = ({ status, body = null }: Reply) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(["img"], { type: "image/jpeg" }), headers: new Headers() });

const jobA = { kind: "JOB", kindLabel: "Lucrare", subjectId: "j1", label: "Litere · ALPHA" };
const jobB = { kind: "JOB", kindLabel: "Lucrare", subjectId: "j2", label: "Litere · BETA" };
const photo = (id: string, stage: "BEFORE" | "SIMULATION" | "AFTER", links: unknown[]) => ({
  documentId: id, title: `Foto ${id}`, kind: "PHOTO", kindLabel: "Fotografie", photoStage: stage, photoStageLabel: { BEFORE: "Înainte", SIMULATION: "Simulare", AFTER: "După montaj" }[stage],
  documentNumber: null, documentDate: "2026-10-20", description: null, originalFileName: `${id}.jpg`, sizeBytes: 2048, preview: "IMAGE", uploadedAt: "2026-10-24T00:00:00.000Z", revision: 1, links,
  viewHref: `/api/customers/cus-1/documents/${id}/content?disposition=inline`, downloadHref: `/api/customers/cus-1/documents/${id}/content?disposition=attachment`,
});

type Selection = { revision: number; status: string; documentId: string | null; invalidatedReason: string | null };
let selections: Record<string, Selection>;
let putReplies: Reply[];
let puts: Array<Record<string, unknown>>;
let canEdit: boolean;
let dossierReads: number;

const photos = () => [
  photo("sim", "SIMULATION", [jobA, jobB]),
  photo("req", "BEFORE", [{ kind: "REQUEST", kindLabel: "Cerere", subjectId: "r1", label: "CER-1 · Litere" }]),
];

const dossierBody = () => ({
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: canEdit, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [{ value: "PHOTO", label: "Fotografie" }], photoStages: [{ value: "BEFORE", label: "Înainte" }, { value: "SIMULATION", label: "Simulare" }, { value: "AFTER", label: "După montaj" }], historyStates: [], maxFileBytes: 1 },
    sites: [],
    siteAssignments: [],
    documents: photos(),
    historicalWorks: [],
    linkTargets: { requests: [{ subjectId: "r1", label: "CER-1 · Litere" }], jobs: [{ subjectId: "j1", label: "Litere · ALPHA" }, { subjectId: "j2", label: "Litere · BETA" }], historicalWorks: [], sites: [] },
    representativePhotos: [
      { workKind: "JOB", workId: "j1", reference: "OF-1 · CER-1", ...(selections.j1 ?? { revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null }) },
      { workKind: "JOB", workId: "j2", reference: "OF-2 · CER-1", ...(selections.j2 ?? { revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null }) },
    ],
  },
});

const historyBody = () => {
  const [sim, req] = photos();
  return {
    history: {
      total: 1, page: 1, pageCount: 1,
      entries: [{
        entryId: "p1", kind: "PROJECT", title: "Litere", reference: "CER-1", eventDateLabel: "", year: 2026, state: null, stateLabel: "", provenance: "WORKOS", provenanceLabel: "În WorkOS",
        site: null, siteAtTimeLabel: null, description: null, request: { requestId: "r1", reference: "CER-1", title: "Litere", statusLabel: "" }, historicalWorkId: null, states: [],
        branches: [{ branchId: "job:j1", state: "COMANDA_CREATA", stateLabel: "", quote: null, orderSnapshotId: "o1", job: { jobId: "j1", stageLabel: "", progressLabel: null, productLabel: "Litere", inscription: "ALPHA" }, site: null },
                   { branchId: "job:j2", state: "COMANDA_CREATA", stateLabel: "", quote: null, orderSnapshotId: "o2", job: { jobId: "j2", stageLabel: "", progressLabel: null, productLabel: "Litere", inscription: "BETA" }, site: null }],
        documents: [sim, req], photoCount: 2, representativePhotoId: null, matchedOn: [],
      }],
      totals: { entries: 1, projects: 1, historicalWorks: 0, uploads: 0, documents: 0, photos: 2 },
      facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] },
    },
  };
};

function Harness() {
  const [, setLocation] = useState(() => window.location.search);
  useEffect(() => {
    const update = () => setLocation(window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return <ClientDetailPage customerId="cus-1" search={window.location.search} />;
}

beforeEach(() => {
  selections = {};
  putReplies = [];
  puts = [];
  canEdit = true;
  dossierReads = 0;
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/workspace")) {
        return reply({ status: 200, body: { workspace: { customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" }, canCreateRequest: true, summary: { requestCount: 1, openRequestCount: 1, quoteCount: 2, jobCount: 2, historicalWorkCount: 0, workCount: 2 }, requests: [], quotes: [], jobs: [] } } });
      }
      if (url.endsWith("/dossier")) {
        dossierReads += 1;
        return reply({ status: 200, body: dossierBody() });
      }
      if (url.includes("/history")) return reply({ status: 200, body: historyBody() });
      if (url.includes("/content")) return reply({ status: 200 });
      if (method === "PUT" && url.endsWith("/works/representative-photo")) {
        const body = JSON.parse(String(init?.body)) as { workId: string; documentId: string | null; expectedRevision: number };
        puts.push(body);
        const scripted = putReplies.shift();
        if (scripted) return reply(scripted);
        const current = selections[body.workId] ?? { revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null };
        selections[body.workId] = { revision: current.revision + 1, status: body.documentId ? "MANUAL" : "AUTOMATIC", documentId: body.documentId, invalidatedReason: null };
        return reply({ status: 200, body: { selection: selections[body.workId], alreadyApplied: false } });
      }
      return reply({ status: 404, body: {} });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function openChooser(photoTitle: string) {
  window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
  render(<Harness />);
  const group = await screen.findByRole("region", { name: "Litere" });
  await userEvent.click(within(group).getByRole("button", { name: `Acțiuni pentru ${photoTitle}` }));
  await userEvent.click(within(group).getByRole("button", { name: /^(Setează ca|Fotografie) reprezentativă…$/ }));
  return screen.findByRole("dialog", { name: "Fotografia reprezentativă a lucrării" });
}

describe("Fotografia reprezentativă a lucrării (N-021)", () => {
  it("asks for the exact work, saves with the revision read and shows the discreet mark", async () => {
    const dialog = await openChooser("Foto sim");
    // Two works have the photo: none is assumed from the photo's place in the gallery.
    expect(within(dialog).getByRole("group", { name: /Alege lucrarea · 2 lucrări/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Setează ca reprezentativă" })).toBeNull();
    expect(within(dialog).getByText(/Este o simulare și rămâne marcată „Simulare”/)).toBeInTheDocument();
    expect(within(dialog).getByText("OF-2 · CER-1")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("radio", { name: /Litere · BETA/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Setează ca reprezentativă" }));
    expect(await within(dialog).findByText("Alegerea a fost salvată.")).toBeInTheDocument();
    expect(puts).toEqual([{ workKind: "JOB", workId: "j2", documentId: "sim", expectedRevision: 0 }]);
    // The dossier is read again: the work now says so, and „Revino la alegerea automată” is offered.
    expect(await within(dialog).findByText("Această fotografie este reprezentativă acum")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Revino la alegerea automată" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const tile = screen.getByRole("button", { name: /Foto sim · Reprezentativă pentru Litere · BETA/ });
    expect(tile).toBeInTheDocument();
    expect(screen.getByText("Reprezentativă pentru 1 lucrare")).toHaveAttribute("title", "Reprezentativă pentru Litere · BETA");
    // The focus returns to the „⋯” that opened the dialog.
    await waitFor(() => expect(screen.getByRole("button", { name: "Acțiuni pentru Foto sim" })).toHaveFocus());
  });

  it("goes back to the automatic choice without touching the photo", async () => {
    selections.j1 = { revision: 3, status: "MANUAL", documentId: "sim", invalidatedReason: null };
    const dialog = await openChooser("Foto sim");
    // The work this photo represents is preselected.
    expect(within(dialog).getByRole("radio", { name: /Litere · ALPHA/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Revino la alegerea automată" }));
    expect(await within(dialog).findByText(/folosește din nou alegerea automată/)).toBeInTheDocument();
    expect(puts).toEqual([{ workKind: "JOB", workId: "j1", documentId: null, expectedRevision: 3 }]);
  });

  it("on a conflict saves nothing, reads the current choice and keeps the chosen work", async () => {
    putReplies = [{ status: 409, body: { error: "stale_revision", selection: null } }];
    const dialog = await openChooser("Foto sim");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Litere · ALPHA/ }));
    const reads = dossierReads;
    // Meanwhile someone else chose another photo for ALPHA.
    selections.j1 = { revision: 1, status: "MANUAL", documentId: "other", invalidatedReason: null };
    await userEvent.click(within(dialog).getByRole("button", { name: "Setează ca reprezentativă" }));
    expect(await within(dialog).findByText("Alegerea a fost schimbată între timp de altcineva.")).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nu s-a salvat nimic");
    await waitFor(() => expect(dossierReads).toBeGreaterThan(reads));
    expect(await within(dialog).findByText("Altă fotografie este aleasă acum")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Litere · ALPHA/ })).toBeChecked();
    // Confirming again sends the revision now read.
    await userEvent.click(within(dialog).getByRole("button", { name: "Setează ca reprezentativă" }));
    expect(await within(dialog).findByText("Alegerea a fost salvată.")).toBeInTheDocument();
    expect(puts.map((put) => put.expectedRevision)).toEqual([0, 1]);
  });

  it("keeps the work chosen after an error and offers to retry; says when the photo is no longer eligible", async () => {
    putReplies = [{ status: 503, body: { error: "storage_unavailable" } }, { status: 422, body: { error: "photo_not_eligible", reason: "NOT_LINKED" } }];
    const dialog = await openChooser("Foto sim");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Litere · BETA/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Setează ca reprezentativă" }));
    expect(await within(dialog).findByText("Alegerea nu s-a salvat.")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Litere · BETA/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă" }));
    expect(await within(dialog).findByText("Fotografia nu mai poate fi aleasă pentru această lucrare.")).toBeInTheDocument();
  });

  it("explains that a request photo must be linked to a work first, and opens „Asociază”", async () => {
    const dialog = await openChooser("Foto req");
    expect(within(dialog).getByText("Fotografia nu este asociată niciunei lucrări")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Asociază unei lucrări…" }));
    expect(await screen.findByRole("dialog", { name: /Asociază „Foto req”/ })).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it("offers no action without the document permission", async () => {
    canEdit = false;
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Harness />);
    const group = await screen.findByRole("region", { name: "Litere" });
    await userEvent.click(within(group).getByRole("button", { name: "Acțiuni pentru Foto sim" }));
    expect(within(group).getByRole("link", { name: "Descarcă" })).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: /^(Setează ca|Fotografie) reprezentativă…$/ })).toBeNull();
  });
});
