import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { navigate } from "../../../routing/navigate";
import { ClientDetailPage } from "../../ClientDetailPage";
import { Relation } from "../ClientsRegister";

/**
 * N-020 etapa 4 · Lucrări (644:12426 · 644:12878 · 644:13352 · 648:13642 · 616:12643 · 648:13594):
 * every work of the client once, one total everywhere, the server's search and filters with their
 * context kept per client, the documents on demand, the historical record and the way back.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const workspace = (customerId: string, workCount: number) => ({
  workspace: {
    customer: { customerId, displayName: customerId === "cus-1" ? "Alpha Clima" : "Beta Fără Lucrări", status: "ACTIVE" },
    canCreateRequest: true,
    summary: { requestCount: 3, openRequestCount: 3, requestNeedsAction: 0, quoteCount: 4, quoteNeedsAction: 0, jobCount: Math.min(workCount, 2), jobNeedsAction: 0, historicalWorkCount: Math.max(workCount - 2, 0), workCount },
    requests: [],
    quotes: [],
    jobs: [],
  },
});

const doc = (documentId: string, title: string, kind = "INVOICE", extra: Record<string, unknown> = {}) => ({
  documentId,
  title,
  kind,
  kindLabel: kind === "PHOTO" ? "Fotografie" : "Factură",
  photoStage: null,
  photoStageLabel: null,
  documentNumber: kind === "PHOTO" ? null : "F-ALC-2021-0412",
  documentDate: "2021-07-02",
  originalFileName: kind === "PHOTO" ? `${documentId}.jpg` : `${documentId}.pdf`,
  sizeBytes: 10,
  preview: kind === "PHOTO" ? "IMAGE" : "PDF",
  uploadedAt: "2026-10-23T10:00:00.000Z",
  revision: 1,
  links: [],
  viewHref: `/view/${documentId}`,
  downloadHref: `/download/${documentId}`,
  ...extra,
});
const simulation = doc("cdoc:sim", "Simulare recepție", "PHOTO", { photoStage: "SIMULATION", photoStageLabel: "Simulare" });

const item = (workId: string, overrides: Record<string, unknown>) => ({
  workId,
  provenance: "WORKOS",
  provenanceLabel: "În WorkOS",
  title: workId,
  detail: null,
  reference: null,
  eventDateLabel: "23 oct. 2026",
  year: 2026,
  state: "IN_EXECUTIE",
  stateLabel: "Execuție în curs",
  site: null,
  siteAtTimeLabel: null,
  description: null,
  job: null,
  request: null,
  quote: null,
  historicalWorkId: null,
  documents: [],
  photoCount: 0,
  requestPhotos: null,
  matchedOn: [],
  ...overrides,
});

const site = { siteId: "s1", name: "Depozit Ghimbav", line: "Depozit Ghimbav · DN1 km 7", active: true };
const workos = [
  item("job:j2", {
    title: "Litere recepție",
    detail: "Litere volumetrice · ALPHA",
    reference: "OF-F5459079",
    quote: { quoteSnapshotId: "q2", reference: "OF-F5459079" },
    request: { requestId: "r2", reference: "CER-19E61523", title: "Litere recepție" },
    job: { jobId: "j2", stageLabel: "În lucru", progressLabel: "0 / 12" },
    requestPhotos: { requestId: "r2", photos: [simulation], shared: false },
  }),
  item("job:j1", {
    title: "Litere showroom",
    state: "FINALIZAT",
    stateLabel: "Finalizată",
    job: { jobId: "j1", stageLabel: "Finalizată", progressLabel: null },
    documents: [doc("cdoc:fs", "Factură showroom")],
  }),
];
const historical = ["h2026", "h2025", "h2021"].map((id) =>
  item(`historical:${id}`, {
    provenance: "HISTORICAL_RECORD",
    provenanceLabel: "Înregistrare istorică",
    title: id === "h2021" ? "Litere depozit 2021" : `Lucrare ${id}`,
    reference: id === "h2021" ? "AC-2021-014" : null,
    eventDateLabel: id === "h2021" ? "iun. 2021 – iul. 2021" : "2025",
    year: Number(id.slice(1)),
    state: "FINALIZAT",
    stateLabel: "Finalizată",
    site: id === "h2021" ? site : null,
    historicalWorkId: id,
    documents: id === "h2021" ? [doc("cdoc:1", "Factură litere depozit")] : [],
  }),
);

let calls: string[] = [];
let permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
let worksFail = false;
let recordFail = false;

function Harness() {
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    const update = () => setLocation(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const customerId = decodeURIComponent(location.split("?")[0]?.split("/")[2] ?? "");
  return <ClientDetailPage key={customerId} customerId={customerId} search={window.location.search} />;
}

function worksPayload(url: string, customerId: string) {
  const params = new URL(url, "http://x").searchParams;
  const all = customerId === "cus-1" ? [...workos, ...historical] : [];
  const id = params.get("id");
  const kind = params.get("kind");
  const year = params.get("year");
  const q = (params.get("q") ?? "").toLowerCase();
  let items = all;
  if (id) items = items.filter((entry) => entry.workId === id);
  if (kind === "HISTORICAL") items = items.filter((entry) => entry.provenance === "HISTORICAL_RECORD");
  if (kind === "WORKOS") items = items.filter((entry) => entry.provenance === "WORKOS");
  if (year) items = items.filter((entry) => String(entry.year) === year);
  if (q) items = items.filter((entry) => String(entry.title).toLowerCase().includes(q));
  const totals = { all: all.length, workos: all.filter((entry) => entry.provenance === "WORKOS").length, historical: all.filter((entry) => entry.provenance !== "WORKOS").length };
  const years = [...new Set(all.map((entry) => entry.year as number))];
  return {
    works: {
      total: items.length,
      page: 1,
      pageCount: 1,
      items,
      totals,
      facets: { years, yearCounts: years.map((value) => ({ year: value, count: items.filter((entry) => entry.year === value).length })), states: [], sites: customerId === "cus-1" ? [{ siteId: "s1", name: "Depozit Ghimbav", active: true, count: 1 }] : [] },
    },
  };
}

beforeEach(() => {
  calls = [];
  worksFail = false;
  recordFail = false;
  permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);
      const customerId = decodeURIComponent(url.split("/api/customers/")[1]?.split("/")[0] ?? "");
      if (url.endsWith("/workspace")) return json(200, workspace(customerId, customerId === "cus-1" ? 5 : 0));
      if (url.endsWith("/dossier")) {
        return json(200, {
          dossier: {
            customerId,
            permissions,
            vocabulary: { documentKinds: [], photoStages: [], historyStates: [], maxFileBytes: 1 },
            sites: [],
            siteAssignments: [],
            documents: [],
            historicalWorks: [{ workId: "h2021", title: "Litere depozit 2021", eventDate: "2021-06", eventDateEnd: "2021-07", reference: "AC-2021-014", description: null, siteId: null, revision: 1 }],
            linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
          },
        });
      }
      if (/\/works(\?|$)/.test(url)) {
        calls.push(url);
        return worksFail ? json(500, { error: "unavailable" }) : json(200, worksPayload(url, customerId));
      }
      if (/\/api\/jobs\/([^/]+)\/record$/.test(url)) {
        const jobId = decodeURIComponent(url.split("/api/jobs/")[1]?.split("/")[0] ?? "");
        if (recordFail) return json(500, { error: "unavailable" });
        if (jobId === "j2") {
          return json(200, {
            record: {
              jobId: "j2",
              files: [
                {
                  artifactId: "art-1",
                  originalFileName: "schiță.dxf",
                  mimeType: "application/dxf",
                  sizeLabel: "12 KB",
                  purpose: "WORKING",
                  purposeLabel: "Lucru",
                  note: null,
                  preview: "NONE",
                  supersedesArtifactId: null,
                  authorLabel: null,
                  uploadedAt: "2026-10-30T08:00:00.000Z",
                  downloadHref: "/api/execution-artifacts/art-1/download",
                  usages: [],
                },
                {
                  artifactId: "art-2",
                  originalFileName: "schiță.dxf",
                  mimeType: "application/dxf",
                  sizeLabel: "14 KB",
                  purpose: "WORKING",
                  purposeLabel: "Lucru",
                  note: null,
                  preview: "NONE",
                  supersedesArtifactId: "art-1",
                  authorLabel: "Ana",
                  uploadedAt: "2026-10-31T08:00:00.000Z",
                  downloadHref: "/api/execution-artifacts/art-2/download",
                  usages: [{ taskId: "task-1", taskLabel: "01 · Lipire", linkedAt: "2026-10-31T09:00:00.000Z", usedAt: null, usedByLabel: null }],
                },
              ],
              hours: {
                asOf: "2026-10-31T00:00:00.000Z",
                totalLabel: "Neînregistrat",
                complete: false,
                completeTasks: 0,
                applicableTasks: 1,
                coverageLabel: "Evidența orelor: lucrare neîncepută",
                startedAt: null,
                completedAt: null,
                elapsedLabel: "Neînceput",
                activeTimeLabel: "Neînregistrat",
                machineTimeLabel: "Neînregistrat",
                machineActive: false,
                people: [],
                tasks: [{
                  taskId: "task-1",
                  processLabel: "Lipire",
                  scopeLabel: "Litere",
                  seqLabel: "01",
                  status: "READY",
                  startedAt: null,
                  completedAt: null,
                  timeLabel: "Neînregistrat",
                  complete: false,
                  coverageLabel: "Neîncepută",
                  statusLabel: "Neîncepută",
                  qualityLabel: null,
                  completedQuantityLabel: null,
                  varianceLabel: null,
                  providerLabel: null,
                  externalProviderLabel: null,
                  actualConsumption: [],
                  people: [],
                  sessions: [],
                }],
              },
              timeline: [],
            },
          });
        }
        return json(200, { record: { jobId, files: [], hours: null, timeline: [] } });
      }
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

const tab = (name: RegExp) => within(screen.getByRole("navigation", { name: "Secțiuni client" })).getByRole("link", { name });
const search = () => new URLSearchParams(window.location.search);
const cards = () => screen.getAllByRole("listitem").filter((entry) => entry.classList.contains("dwcard"));

describe("Lucrări · the list (644:12426)", () => {
  it("counts every work once, with the same total in the tab, the heading and the register", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    render(<Harness />);
    expect(await screen.findByText("5 lucrări · 2 în WorkOS · 3 înregistrări istorice")).toBeInTheDocument();
    // R1: the tab has a short label; the total is in the heading above.
    expect(tab(/^Lucrări/)).toHaveAccessibleName("Lucrări");
    expect(screen.getByRole("button", { name: "Toate · 5" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Istorice · 3" })).toBeInTheDocument();
    expect(cards()).toHaveLength(5);
    expect(new Set(cards().map((card) => card.textContent)).size).toBe(5);
    // The provenance is said once per historical card, apart from its state.
    for (const card of cards().filter((entry) => entry.getAttribute("data-provenance") === "HISTORICAL_RECORD")) {
      expect(within(card).getAllByText(/Înregistrare istorică/)).toHaveLength(1);
      expect(within(card).getByText("Finalizată")).toBeInTheDocument();
    }
    // A WorkOS work opens its existing job sheet.
    expect(within(cards()[0]!).getByRole("link", { name: "Deschide memoria lucrării: Litere recepție" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&lucrare=job%3Aj2");
  });

  it("tells works apart by their references and product, and names a request photo as the request's", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    render(<Harness />);
    await screen.findByText("5 lucrări · 2 în WorkOS · 3 înregistrări istorice");
    const first = cards()[0]!;
    expect(within(first).getByText("În WorkOS · OF-F5459079 · CER-19E61523")).toBeInTheDocument();
    expect(within(first).getByText("Litere volumetrice · ALPHA")).toBeInTheDocument();
    expect(within(first).getByText("comandată 23 oct. 2026")).toBeInTheDocument();
    expect(within(first).getByText("Execuție în curs · 0 / 12")).toBeInTheDocument();
    // GO 12 rule: the request's photo is context only, said so; never the work's own.
    expect(within(first).getByText("Imagine: simulare din cerere · nu e fotografia lucrării")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Deschide fotografia din cerere Simulare recepție" })).toBeInTheDocument();
    // A work without documents or photos says so instead of offering an empty list.
    expect(within(cards()[2]!).getByText("Fără documente încă")).toBeInTheDocument();
  });

  it("opens the documents on demand in the address, without a new history entry, and closes them", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    render(<Harness />);
    await screen.findByText("5 lucrări · 2 în WorkOS · 3 înregistrări istorice");
    const showroom = cards()[1]!;
    const toggle = within(showroom).getByRole("button", { name: "1 document · 0 fotografii" });
    const length = window.history.length;
    await userEvent.click(toggle);
    await waitFor(() => expect(search().get("deschis")).toBe("job:j1"));
    expect(window.history.length).toBe(length);
    const open = cards()[1]!;
    expect(within(open).getByText("Documente · 1")).toBeInTheDocument();
    expect(within(open).getByRole("button", { name: "Previzualizează Factură showroom" })).toBeInTheDocument();
    expect(within(open).getByRole("link", { name: "Descarcă Factură showroom" })).toHaveAttribute("href", "/download/cdoc:fs");
    await userEvent.click(within(open).getByRole("button", { name: "Ascunde documentele" }));
    await waitFor(() => expect(search().get("deschis")).toBeNull());
  });
});

describe("Lucrări · search and filters (644:13352)", () => {
  it("Istorice + 2021 → the record → a document → back to the same filtered list (route 1)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Istorice · 3" }));
    await waitFor(() => expect(search().get("tip")).toBe("HISTORICAL"));
    await userEvent.click(screen.getByRole("button", { name: "An" }));
    await userEvent.click(within(screen.getByRole("list", { name: "An" })).getAllByRole("button").find((option) => option.textContent?.startsWith("2021"))!);
    await waitFor(() => expect(search().get("an")).toBe("2021"));
    expect(await screen.findByText("1 din 5 lucrări")).toBeInTheDocument();
    expect(screen.getByText("Proveniență: Istorice")).toBeInTheDocument();
    expect(screen.getByText("An: 2021")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Deschide înregistrarea: Litere depozit 2021" }));
    await waitFor(() => expect(search().get("lucrare")).toBe("h2021"));
    expect(await screen.findByRole("heading", { name: "Litere depozit 2021" })).toBeInTheDocument();
    expect(screen.getByText("iun. 2021 – iul. 2021")).toBeInTheDocument();
    expect(screen.getByText("Lucrare dinainte de WorkOS: nu are comandă, operații sau pontaje.")).toBeInTheDocument();
    expect(screen.queryByText(/pontaj:|operații în curs|progres/i)).toBeNull();
    // A document opens over the record and gives the focus back to its control.
    const previewButton = screen.getByRole("button", { name: "Previzualizează Factură litere depozit" });
    previewButton.focus();
    await userEvent.click(previewButton);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Previzualizează Factură litere depozit" }));
    // The way back names the filtered list and returns to it.
    await userEvent.click(screen.getByRole("link", { name: "← Lucrări · Istorice · 2021" }));
    await waitFor(() => expect(search().get("lucrare")).toBeNull());
    expect(search().get("tip")).toBe("HISTORICAL");
    expect(search().get("an")).toBe("2021");
    expect(await screen.findByText("1 din 5 lucrări")).toBeInTheDocument();
  });

  it("removes one filter and keeps the others; a reset stays a reset after refresh and the tab (route 5)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&tip=HISTORICAL&an=2021&q=litere");
    const view = render(<Harness />);
    expect(await screen.findByText("1 din 5 lucrări pentru „litere”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "An · 2021" }));
    await userEvent.click(within(screen.getByRole("list", { name: "An" })).getByRole("button", { name: "Toți anii" }));
    await waitFor(() => expect(search().get("an")).toBeNull());
    expect(search().get("tip")).toBe("HISTORICAL");
    expect(search().get("q")).toBe("litere");
    // Another tab and back: the whole context returns.
    await userEvent.click(tab(/^Documente/));
    await userEvent.click(tab(/^Lucrări/));
    await waitFor(() => expect(search().get("tip")).toBe("HISTORICAL"));
    expect(search().get("q")).toBe("litere");
    // Reset, then refresh and the tab: nothing comes back.
    await userEvent.click(await screen.findByRole("button", { name: "Elimină filtrul Proveniență: Istorice" }));
    await userEvent.click(screen.getByRole("button", { name: "Elimină căutarea „litere”" }));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=lucrari"));
    view.unmount();
    resetResourceCache();
    render(<Harness />);
    expect(await screen.findByText("5 lucrări · 2 în WorkOS · 3 înregistrări istorice")).toBeInTheDocument();
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Lucrări/));
    await waitFor(() => expect(search().get("sectiune")).toBe("lucrari"));
    expect(search().get("tip")).toBeNull();
    expect(search().get("q")).toBeNull();
  });

  it("keeps each client's context apart, and says plainly when a client has no works (route 6)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&tip=HISTORICAL");
    render(<Harness />);
    expect(await screen.findByText("3 din 5 lucrări")).toBeInTheDocument();
    act(() => navigate("/clienti/cus-2?sectiune=lucrari"));
    expect(await screen.findByText("Nicio lucrare")).toBeInTheDocument();
    expect(search().get("tip")).toBeNull();
    expect(screen.getByRole("button", { name: "Toate · 0" })).toHaveAttribute("aria-pressed", "true");
  });

  it("names a search without results and what it was looking for", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&tip=HISTORICAL&q=vitrina");
    render(<Harness />);
    expect(await screen.findByText("0 din 5 lucrări pentru „vitrina”")).toBeInTheDocument();
    expect(screen.getByText("Proveniență: Istorice")).toBeInTheDocument();
    expect(screen.getByText("Nicio lucrare pentru căutarea și filtrele alese")).toBeInTheDocument();
  });

  it("keeps the filters through a failed read, with its own retry (616:12643)", async () => {
    worksFail = true;
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&tip=HISTORICAL&an=2021");
    render(<Harness />);
    expect(await screen.findByText("Lucrările nu au putut fi încărcate.")).toBeInTheDocument();
    expect(screen.getByText("Filtrele rămân păstrate.")).toBeInTheDocument();
    expect(search().get("tip")).toBe("HISTORICAL");
    worksFail = false;
    await userEvent.click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByText("1 din 5 lucrări")).toBeInTheDocument();
  });
});

describe("Lucrări · the historical record (648:13642)", () => {
  it("offers Modifică and Adaugă only with the permissions, and links to Istoric", async () => {
    permissions = { ...permissions, uploadDocuments: false, recordHistoricalWork: false };
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&lucrare=h2021");
    render(<Harness />);
    expect(await screen.findByRole("heading", { name: "Litere depozit 2021" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifică" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adaugă documente sau fotografii" })).toBeNull();
    expect(screen.getByRole("link", { name: "Vezi în Istoric, la 2021 →" })).toHaveAttribute("href", expect.stringContaining("deschis=historical%3Ah2021"));
    // A direct link has no origin: the way back is the Lucrări list.
    expect(screen.getByRole("link", { name: "← Lucrări" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari");
  });

  it("shows the record's identity: reference, period, site and state", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&lucrare=h2021");
    render(<Harness />);
    expect(await screen.findByRole("heading", { name: "Litere depozit 2021" })).toBeInTheDocument();
    expect(screen.getByText("AC-2021-014 · anterioară WorkOS")).toBeInTheDocument();
    expect(screen.getByText("Depozit Ghimbav · DN1 km 7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifică" })).toBeInTheDocument();
    expect(calls.some((url) => url.includes("id=historical%3Ah2021"))).toBe(true);
  });
});

describe("Memoria lucrării", () => {
  it("opens the recorded operation and does not turn a missing plan into zero", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    render(<Harness />);
    await user.click(await screen.findByRole("link", { name: "Deschide memoria lucrării: Litere recepție" }));
    expect(await screen.findByRole("heading", { name: "Litere recepție" })).toBeInTheDocument();
    expect(screen.getByText("Sediu neînregistrat")).toBeInTheDocument();
    expect(screen.getByText("Evidența orelor: lucrare neîncepută · Neînregistrat")).toBeInTheDocument();
    expect(screen.queryByText("Plan de execuție neînregistrat")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dosarul tehnic · 01" })).toHaveAttribute("href", "/lucrari/j2?task=task-1&sectiune=operatii");
    expect(screen.getByText("Niciun eveniment înregistrat")).toBeInTheDocument();
    const versions = screen.getAllByRole("link", { name: "schiță.dxf" });
    expect(versions.map((link) => link.getAttribute("href"))).toEqual([
      "/lucrari/j2?sectiune=fisiere&fisier=art-1",
      "/lucrari/j2?sectiune=fisiere&fisier=art-2",
    ]);
    expect(screen.getByText("Revizie 2 din 2 · versiunea anterioară rămâne păstrată")).toBeInTheDocument();
    expect(screen.getByText("Asociat · utilizare neconfirmată")).toBeInTheDocument();
    expect(screen.queryByText("Utilizare înregistrată")).not.toBeInTheDocument();
    expect(screen.getByText("Consum neînregistrat")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "inexistent");
    expect(await screen.findByText("Niciun rezultat pentru textul căutat în dosarul înregistrat")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dosarul tehnic · 01" })).not.toBeInTheDocument();
  });

  it("says the plan is missing, not that the work has zero operations", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&lucrare=job:j1");
    render(<Harness />);
    expect(await screen.findByRole("heading", { name: "Litere showroom" })).toBeInTheDocument();
    expect(screen.getByText("Plan de execuție neînregistrat")).toBeInTheDocument();
    expect(screen.getByText("Ore neînregistrate")).toBeInTheDocument();
    expect(screen.queryByText("0 operații")).not.toBeInTheDocument();
  });

  it("keeps a failed record from looking like an empty dossier", async () => {
    recordFail = true;
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&lucrare=job:j2");
    render(<Harness />);
    expect(await screen.findByText("Dosarul tehnic nu a putut fi citit.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Litere recepție" })).toBeInTheDocument();
    expect(screen.queryByText("Niciun fișier în dosarul tehnic")).not.toBeInTheDocument();
    expect(screen.queryByText("Plan fără operații înregistrate")).not.toBeInTheDocument();
    expect(screen.queryByText("Se citește dosarul înregistrat…")).not.toBeInTheDocument();
  });

  it("does not read another client's job", async () => {
    window.history.replaceState({}, "", "/clienti/cus-2?sectiune=lucrari&lucrare=job:j2");
    render(<Harness />);
    expect(await screen.findByText("Lucrarea nu există")).toBeInTheDocument();
    expect(screen.queryByText("Lipire")).not.toBeInTheDocument();
  });
});

describe("Clienți register", () => {
  it("shows the same work total", () => {
    render(<Relation customer={{ openRequestCount: 3, quoteCount: 4, jobCount: 2, historicalWorkCount: 3, workCount: 5 }} />);
    expect(screen.getByText("lucrări", { exact: false }).closest("span")).toHaveTextContent("lucrări 5");
    expect(screen.getByTitle("În WorkOS: 2 · istorice: 3")).toBeInTheDocument();
  });
});
