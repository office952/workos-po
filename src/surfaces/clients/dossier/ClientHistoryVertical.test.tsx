import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 · Istoric vertical: an expanded project shows one request and each offer and work once,
 * an unaccepted offer gets no work, the expanded entry and the provenance filter live in the URL,
 * and Fotografii orders a project's photos before → simulation → after.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const quote = (quoteSnapshotId: string, reference: string, grossDisplay: string, orderSnapshotId: string | null) => ({
  quoteSnapshotId, kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay, currency: "RON",
  productCode: "P", productLabel: "Litere volumetrice", reference, inscription: "ALPHA", customerDisplayName: "Alpha", stage: "QUOTE_CREATED",
  stageLabel: "Creată", createdAt: null, nextAction: "OPEN_QUOTE", nextActionLabel: "Deschide oferta", needsAttention: false, attentionLabel: null,
  requestId: "req-1", requestReference: "CER-1", orderSnapshotId,
});

const workspace = {
  workspace: {
    customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" },
    canCreateRequest: true,
    summary: { requestCount: 1, openRequestCount: 1, quoteCount: 2, jobCount: 1, historicalWorkCount: 0, workCount: 1 },
    requests: [],
    quotes: [quote("q1", "OF-1", "12.400,00", "o1"), quote("q2", "OF-2", "9.800,00", null)],
    jobs: [],
  },
};

const photo = (documentId: string, stage: string, stageLabel: string, date: string, links: unknown[] = []) => ({
  documentId, title: `Foto ${stageLabel}`, kind: "PHOTO", kindLabel: "Fotografie", photoStage: stage, photoStageLabel: stageLabel,
  documentNumber: null, documentDate: date, description: stage === "SIMULATION" ? "Simulare ilustrativă" : null, originalFileName: `${documentId}.png`,
  sizeBytes: 10, preview: "IMAGE", uploadedAt: `${date}T10:00:00.000Z`, revision: 1, links, viewHref: `/v/${documentId}`, downloadHref: `/d/${documentId}`,
});

const project = {
  entryId: "project:req-1",
  kind: "PROJECT",
  title: "Litere recepție Alpha",
  reference: null,
  eventDateLabel: "din 23 oct. 2026",
  year: 2026,
  state: null,
  stateLabel: "Ramuri în stări diferite",
  provenance: "WORKOS",
  provenanceLabel: "În WorkOS",
  site: { siteId: "site:1", name: "Recepție", line: "Recepție · Brașov", active: true },
  siteAtTimeLabel: null,
  description: null,
  request: { requestId: "req-1", reference: "CER-1", title: "Litere", statusLabel: "Deschisă" },
  historicalWorkId: null,
  states: ["IN_EXECUTIE", "OFERTARE"],
  branches: [
    { branchId: "job-1", state: "IN_EXECUTIE", stateLabel: "Execuție în curs", quote: { quoteSnapshotId: "q1", kind: "PRODUCT", productCode: "P", reference: "OF-1", stageLabel: "Cu comandă", superseded: false }, orderSnapshotId: "o1", job: { jobId: "job-1", stageLabel: "În execuție", progressLabel: "0/12", productLabel: "Litere", inscription: "ALPHA" }, site: null },
    { branchId: "q2", state: "OFERTARE", stateLabel: "Ofertare", quote: { quoteSnapshotId: "q2", kind: "PRODUCT", productCode: "P", reference: "OF-2", stageLabel: "Creată", superseded: false }, orderSnapshotId: null, job: null, site: null },
  ],
  documents: [photo("after", "AFTER", "După montaj", "2026-10-20"), photo("before", "BEFORE", "Înainte", "2026-09-01"), photo("sim", "SIMULATION", "Simulare", "2026-09-10")],
  photoCount: 3,
  matchedOn: [],
};

const upload = {
  ...project,
  entryId: "document:cdoc:9",
  kind: "DOCUMENT",
  title: "Contract-cadru",
  state: null,
  stateLabel: "",
  provenance: "UPLOAD",
  provenanceLabel: "Document încărcat",
  request: null,
  states: [],
  branches: [],
  documents: [{ ...photo("cdoc:9", "", "", "2026-01-05"), kind: "CONTRACT", kindLabel: "Contract", photoStage: null, photoStageLabel: null, preview: "PDF", title: "Contract-cadru" }],
  photoCount: 0,
};

function historyPayload(url: string) {
  const params = new URL(url, "http://x").searchParams;
  const provenance = params.get("provenance");
  const entries = [project, upload].filter((entry) => !provenance || entry.provenance === provenance);
  return {
    history: {
      total: entries.length,
      page: 1,
      pageCount: 1,
      entries,
      totals: { entries: 2, projects: 1, historicalWorks: 0, uploads: 1, documents: 1, photos: 3 },
      facets: {
        years: [2026],
        yearCounts: [{ year: 2026, count: entries.length }],
        states: [{ state: "OFERTARE", label: "Ofertare", count: provenance === "UPLOAD" ? 0 : 1 }],
        provenances: [
          { provenance: "WORKOS", label: "În WorkOS", count: 1 },
          { provenance: "HISTORICAL_RECORD", label: "Înregistrare istorică", count: 0 },
          { provenance: "UPLOAD", label: "Document încărcat", count: 1 },
        ],
        sites: [],
      },
    },
  };
}

const dossier = {
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [], photoStages: [{ value: "BEFORE", label: "Înainte" }, { value: "SIMULATION", label: "Simulare" }, { value: "AFTER", label: "După montaj" }], historyStates: [], maxFileBytes: 1 },
    sites: [],
    siteAssignments: [],
    documents: [],
    historicalWorks: [],
    linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
};

let calls: string[] = [];

function Routed() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const update = () => setSearch(window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return <ClientDetailPage customerId="cus-1" search={search} />;
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/workspace")) return json(200, workspace);
      if (url.endsWith("/dossier")) return json(200, dossier);
      if (url.includes("/history")) return json(200, historyPayload(url));
      return json(404, {});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Istoric vertical (N-020)", () => {
  it("expands a project in the URL and shows each offer and work once, with no work for the unaccepted offer", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Routed />);
    const title = await screen.findByRole("heading", { level: 4, name: "Litere recepție Alpha" });
    const card = title.closest("article") as HTMLElement;
    // Mixed offers keep each stage (never reduced to the most advanced one).
    expect(within(card).getByLabelText("Cerere, apoi 2 oferte · 1 cu comandă, 1 creată, apoi 1 lucrare")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: /Extinde/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("deschis")).toBe("project:req-1"));
    const expanded = (await screen.findByRole("button", { name: /Restrânge/ })).closest("article") as HTMLElement;
    // N-020 · 813:31187: each offer once (amount, its own actions), the work of the ordered one once.
    const offers = within(within(expanded).getByRole("region", { name: "Oferte și lucrările lor" })).getAllByRole("listitem");
    expect(offers).toHaveLength(2);
    expect(within(expanded).getAllByRole("link", { name: /^Deschide oferta OF-/ })).toHaveLength(2);
    expect(within(expanded).getAllByRole("button", { name: /^Previzualizează oferta OF-/ })).toHaveLength(2);
    expect(within(expanded).getAllByText("12.400,00 RON")).toHaveLength(1);
    expect(within(expanded).getAllByRole("link", { name: /^Lucrare · / })).toHaveLength(1);
    expect(within(expanded).getAllByText("Fără lucrare · oferta nu are comandă")).toHaveLength(1);
    // The request once, with its way in.
    expect(within(expanded).getAllByText("CER-1")).toHaveLength(1);
    expect(within(expanded).getAllByRole("link", { name: "Deschide cererea →" })).toHaveLength(1);
    // Photos of the project in the order of the work, whatever the upload order.
    const stages = within(expanded).getAllByRole("button", { name: /Deschide fotografia/ }).map((button) => button.getAttribute("aria-label"));
    expect(stages).toEqual(["Deschide fotografia Foto Înainte", "Deschide fotografia Foto Simulare", "Deschide fotografia Foto După montaj"]);
    await userEvent.click(within(expanded).getByRole("button", { name: /Restrânge/ }));
    await waitFor(() => expect(window.location.search).not.toContain("deschis="));
  });

  it("filters by provenance on the server and keeps the filter in the URL", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Routed />);
    await screen.findByRole("heading", { level: 4, name: "Litere recepție Alpha" });
    await userEvent.click(screen.getByRole("button", { name: "Proveniență" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Proveniență" })).getByRole("button", { name: /Document încărcat/ }));
    await waitFor(() => expect(window.location.search).toContain("provenienta=UPLOAD"));
    await waitFor(() => expect(calls.some((url) => url.includes("provenance=UPLOAD"))).toBe(true));
    expect(await screen.findByRole("heading", { level: 4, name: "Contract-cadru" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4, name: "Litere recepție Alpha" })).toBeNull();
    // An uploaded document has no state.
    const card = screen.getByRole("heading", { level: 4, name: "Contract-cadru" }).closest("article") as HTMLElement;
    expect(card.querySelector(".dstate")).toBeNull();
    expect(screen.getByRole("button", { name: "Proveniență · Document încărcat" })).toBeInTheDocument();
  });

  it("groups Fotografii by project with stages in order and opens the viewer on the project", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Routed />);
    const group = await screen.findByRole("region", { name: "Litere recepție Alpha" });
    const order = within(group).getAllByRole("button", { name: /^Deschide fotografia/ }).map((button) => button.getAttribute("aria-label"));
    expect(order).toEqual(["Deschide fotografia 1 din 3: Înainte · Foto Înainte", "Deschide fotografia 2 din 3: Simulare · Foto Simulare", "Deschide fotografia 3 din 3: După montaj · Foto După montaj"]);
    expect(within(group).getAllByText("Ilustrativ")).toHaveLength(1);
    await userEvent.click(within(group).getByRole("button", { name: /^Deschide fotografia 2 din 3/ }));
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByText(/Litere recepție Alpha · 2 din 3/)).toBeInTheDocument();
    await userEvent.click(within(viewer).getByRole("button", { name: "Fotografia următoare" }));
    expect(within(viewer).getByText(/3 din 3/)).toBeInTheDocument();
    await userEvent.click(within(viewer).getByRole("button", { name: "Închide · Esc" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Etapă (675:18640): the menu over the gallery; the set of the group follows the filter.
    await userEvent.click(screen.getByRole("button", { name: /^Etapă/ }));
    await userEvent.click(within(screen.getByRole("list", { name: "Etapă" })).getByRole("button", { name: /^Simulare/ }));
    await waitFor(() => expect(window.location.search).toContain("etapa=SIMULATION"));
    expect(within(screen.getByRole("region", { name: "Litere recepție Alpha" })).getAllByRole("button", { name: /^Deschide fotografia/ })).toHaveLength(1);
  });
});
