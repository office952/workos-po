import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 · „De urmărit” (design final 649:14128: one control, closed by default, warm only for what
 * the server marks, neutral for works in progress) and its destinations, the list context of Documente and Cereri și oferte (restored on a return, reset stays
 * reset), the request photo as context on a work, and the server counts of the Lucrări rail.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const baseRequest = {
  customerId: "cus-1", customerDisplayName: "Alpha", status: "OPEN", statusLabel: "Deschisă", contextLabel: null, commercialProgress: null, createdAt: null,
  nextAction: "OPEN_REQUEST", nextActionLabel: "Deschide cererea", nextActionHref: null, needsAttention: false, attentionLabel: null,
  linkedQuoteSnapshotId: null, linkedQuoteProductCode: null, linkedAssemblyId: null,
};
const baseQuote = {
  kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay: "605,00", currency: "EUR", productCode: "P",
  productLabel: "Panou", inscription: "", customerDisplayName: "Alpha", stage: "QUOTE_CREATED", stageLabel: "Creată", createdAt: null,
  nextAction: "ACCEPT_QUOTE", nextActionLabel: "Marchează acceptată", needsAttention: false, attentionLabel: null, requestId: "r1", requestReference: "CER-1", orderSnapshotId: null,
};
const request = (requestId: string, title: string, extra: Record<string, unknown> = {}) => ({ ...baseRequest, requestId, title, reference: `CER-${requestId}`, ...extra });
const quote = (id: string, extra: Record<string, unknown> = {}) => ({ ...baseQuote, quoteSnapshotId: id, reference: `OF-${id}`, ...extra });
const waiting = { needsAttention: true, attentionLabel: "Urmează acceptarea" };

let workspaceBody: unknown;
let worksBody: unknown;
const workspaceOf = (requests: unknown[], quotes: unknown[], jobs: unknown[] = []) => ({
  workspace: {
    customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE", cui: "RO1", contactName: "Ana Pop", phone: "0700 000 111", email: null },
    canCreateRequest: true,
    summary: { requestCount: requests.length, openRequestCount: requests.length, quoteCount: quotes.length, jobCount: jobs.length, historicalWorkCount: 3, workCount: jobs.length + 3 },
    requests,
    quotes,
    jobs,
  },
});

const doc = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  documentId: id, title: id, kind, kindLabel: kind === "INVOICE" ? "Factură" : kind === "CONTRACT" ? "Contract" : "Fotografie", photoStage: kind === "PHOTO" ? "BEFORE" : null,
  photoStageLabel: kind === "PHOTO" ? "Înainte" : null, documentNumber: null, documentDate: "2026-10-09", description: null, originalFileName: `${id}.pdf`, sizeBytes: 1,
  preview: kind === "PHOTO" ? "IMAGE" : "PDF", uploadedAt: "2026-10-09T00:00:00.000Z", revision: 1, links: [], viewHref: `/v/${id}`, downloadHref: `/d/${id}`, ...extra,
});

const dossier = {
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [{ value: "CONTRACT", label: "Contract" }, { value: "INVOICE", label: "Factură" }], photoStages: [], historyStates: [], maxFileBytes: 1 },
    sites: [{ siteId: "site:1", name: "Depozit", address: null, city: null, contactName: null, phone: null, accessNotes: null, status: "ACTIVE", statusLabel: "Activ", revision: 1, usage: { requests: 0, jobs: 0, historicalWorks: 0, documents: 0 } }],
    siteAssignments: [], documents: [doc("Factură 1", "INVOICE"), doc("Contract 1", "CONTRACT")], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
};

const history = {
  history: {
    total: 0, page: 1, pageCount: 1, entries: [],
    totals: { entries: 8, projects: 3, historicalWorks: 3, uploads: 2, documents: 9, photos: 10 },
    facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] },
  },
};

const workItem = (workId: string, extra: Record<string, unknown>) => ({
  workId, provenance: "WORKOS", provenanceLabel: "În WorkOS", title: workId, detail: null, reference: null, eventDateLabel: "23 oct. 2026", year: 2026,
  state: "IN_EXECUTIE", stateLabel: "Execuție în curs", site: null, siteAtTimeLabel: null, description: null, job: { jobId: workId, stageLabel: "În execuție", progressLabel: null },
  request: { requestId: "r1", reference: "CER-1", title: "Recepție" }, quote: null, historicalWorkId: null, documents: [], photoCount: 0, requestPhotos: null, matchedOn: [], ...extra,
});

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
  sessionStorage.clear();
  workspaceBody = workspaceOf([request("r1", "Casetă")], [quote("q1")]);
  worksBody = { works: { total: 0, page: 1, pageCount: 1, items: [], totals: { all: 0, workos: 0, historical: 0 }, facets: { years: [], yearCounts: [], states: [], sites: [] } } };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/workspace")) return json(200, workspaceBody);
    if (url.endsWith("/dossier")) return json(200, dossier);
    if (url.includes("/history")) return json(200, history);
    if (url.includes("/works")) return json(200, worksBody);
    return json(404, {});
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const search = () => new URLSearchParams(window.location.search);
const tab = (name: RegExp) => within(screen.getByRole("navigation", { name: "Secțiuni client" })).getByRole("link", { name });

const job = (jobId: string, stage: string, extra: Record<string, unknown> = {}) => ({
  jobId, kind: "PRODUCT", kindLabel: "Produs", productCode: "P", productLabel: "Litere", inscription: "ALPHA", memberLabels: [], customerId: "cus-1", customerDisplayName: "Alpha",
  requestId: "r1", stage, stageLabel: stage === "EXECUTION_IN_PROGRESS" ? "În lucru" : "Eliberată", nextAction: "CREATE_EXECUTION_PLAN", nextActionLabel: "", priority: "NORMAL", priorityLabel: "Standard", targetDate: null,
  targetDateLabel: "Fără termen", planningEditable: false, overdue: false, needsAttention: false, attentionLabel: null, progressLabel: null, createdAt: null,
  releaseSnapshotId: null, planId: null, orderSnapshotId: "o1", ...extra,
});
const watch = () => screen.queryByRole("region", { name: "De urmărit" });
const watchButton = () => within(watch() as HTMLElement).getByRole("button", { name: /^De urmărit/ });

describe("De urmărit · one control, opened on purpose (649:14128)", () => {
  it("nothing open: no control at all; short tabs without a dot (R1); no nested links", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    const { container } = render(<Harness />);
    await screen.findByRole("heading", { level: 2, name: "Istoric" });
    expect(watch()).toBeNull();
    expect(tab(/^Cereri și oferte/)).toHaveAccessibleName("Cereri și oferte");
    expect(tab(/^Lucrări/)).toHaveAccessibleName("Lucrări");
    // The fixture names no year: no first activity is invented.
    expect(screen.queryByText(/Prima activitate documentată|Nicio activitate/)).toBeNull();
    expect(container.querySelector("a a, a button, button a")).toBeNull();
  });

  it("two offers waiting: closed by default, the summary says it, opened it names both and leads to them", async () => {
    workspaceBody = workspaceOf([request("r1", "Casetă")], [quote("q1", waiting), quote("q2", waiting)]);
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await waitFor(() => expect(watch()).not.toBeNull());
    const control = watchButton();
    expect(control).toHaveAttribute("aria-expanded", "false");
    // R1: concrete, in the server words — not a vague count.
    expect(control).toHaveTextContent("2 oferte urmează acceptarea");
    expect(within(watch() as HTMLElement).queryByRole("link")).toBeNull();
    // Typing a search never hides it.
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută în istoric" }), "x");
    expect(watch()).not.toBeNull();
    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(within(watch() as HTMLElement).getByText("2 oferte pentru Casetă: urmează acceptarea")).toBeInTheDocument();
    expect(within(watch() as HTMLElement).getByText("OF-q1 · 605,00 EUR · OF-q2 · 605,00 EUR")).toBeInTheDocument();
    await userEvent.click(within(watch() as HTMLElement).getByRole("link", { name: /Vezi ofertele în Cereri și oferte/ }));
    // 659:14083: De urmărit opens Pe cereri + În așteptare, the request whole, with the way back.
    await waitFor(() => expect(search().get("atentie")).toBe("1"));
    expect(search().get("selectie")).toBeNull();
    const view = await screen.findByRole("region", { name: "Cereri și oferte" });
    expect(within(view).getByRole("button", { name: "Pe cereri · 1 cerere" })).toHaveAttribute("aria-pressed", "true");
    expect(within(view).getByRole("button", { name: "În așteptare · 2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(view).getByText("1 din 1 cerere · 2 oferte în așteptare")).toBeInTheDocument();
    expect(within(view).getByText("Filtru: În așteptare")).toBeInTheDocument();
    expect(within(view).getByRole("link", { name: "Deschide oferta OF-q1" })).toBeInTheDocument();
    expect(within(view).getByRole("link", { name: "Deschide oferta OF-q2" })).toBeInTheDocument();
    expect(within(view).getByRole("link", { name: "← Istoric" })).toBeInTheDocument();
  });

  it("mixed attention: each situation once, warm, with its own destination", async () => {
    workspaceBody = workspaceOf(
      [request("r1", "Casetă", { needsAttention: true, attentionLabel: "Cerere nouă" })],
      [quote("q1", waiting)],
      [job("j1", "RELEASED", { needsAttention: true, attentionLabel: "Fără plan de execuție" })],
    );
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await waitFor(() => expect(watch()).not.toBeNull());
    expect(watch()).toHaveAttribute("data-tone", "attention");
    expect(watchButton()).toHaveTextContent("1 ofertă urmează acceptarea · Cererea Casetă: cerere nouă · Casetă: fără plan de execuție");
    expect(watchButton()).not.toHaveTextContent(/de urmărit ·|de urmărit$/);
    await userEvent.click(watchButton());
    const items = within(watch() as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri&atentie=1");
    expect(within(items[1]!).getByRole("link", { name: /Deschide cererea/ })).toHaveAttribute("href", "/cereri/r1");
    expect(within(items[2]!).getByText("Casetă: fără plan de execuție")).toBeInTheDocument();
    expect(within(items[2]!).getByRole("link", { name: /Deschide fișa lucrării/ })).toHaveAttribute("href", "/lucrari/j1");
  });

  it("works only in progress or not finished: a neutral indicator; not finished is never in progress", async () => {
    workspaceBody = workspaceOf([request("r1", "Casetă")], [quote("q1")], [job("j1", "EXECUTION_IN_PROGRESS"), job("j2", "RELEASED")]);
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await waitFor(() => expect(watch()).not.toBeNull());
    expect(watch()).toHaveAttribute("data-tone", "neutral");
    expect(watchButton()).toHaveTextContent("1 lucrare în execuție · 1 lucrare nefinalizată");
    await userEvent.click(watchButton());
    expect(within(watch() as HTMLElement).getByText("Casetă este în execuție")).toBeInTheDocument();
    expect(within(watch() as HTMLElement).getByText("Casetă: eliberată")).toBeInTheDocument();
  });
});

describe("list context · Documente and Cereri și oferte", () => {
  it("Documente: the filters come back through the tab; a reset stays a reset", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    render(<Harness />);
    // N-020 etapa 5: the Tip menu (670:16320).
    await userEvent.click(await screen.findByRole("button", { name: "Tip" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Tip" })).getByRole("button", { name: /^Contract/ }));
    await waitFor(() => expect(search().get("tip")).toBe("CONTRACT"));
    await userEvent.click(tab(/^Istoric/));
    await waitFor(() => expect(search().get("sectiune")).toBeNull());
    expect(tab(/^Documente/)).toHaveAttribute("href", "/clienti/cus-1?sectiune=documente&tip=CONTRACT");
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(search().get("tip")).toBe("CONTRACT"));
    expect(await screen.findByText("1 din 2 documente")).toBeInTheDocument();
    // Reset, leave, come back: nothing returns.
    await userEvent.click(screen.getByRole("button", { name: /^Elimină filtrul Tip:/ }));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
  });

  it("Cereri și oferte: the search comes back from the header link; Arată tot stays clear", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri");
    render(<Harness />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Caută cereri și oferte" }), "casetă");
    await waitFor(() => expect(search().get("q")).toBe("casetă"));
    await userEvent.click(tab(/^Istoric/));
    await waitFor(() => expect(search().get("sectiune")).toBeNull());
    // N-020 design final · the section tab brings the search back.
    await userEvent.click(tab(/^Cereri și oferte/));
    await waitFor(() => expect(search().get("sectiune")).toBe("cereri"));
    expect(search().get("q")).toBe("casetă");
    await userEvent.click(screen.getByRole("button", { name: "Elimină căutarea „casetă”" }));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=cereri"));
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Cereri și oferte/));
    await waitFor(() => expect(search().get("sectiune")).toBe("cereri"));
    expect(search().get("q")).toBeNull();
  });

  it("an offer preview over the view keeps the list context in the address and in memory", async () => {
    workspaceBody = workspaceOf([request("r1", "Casetă")], [quote("q1", waiting), quote("q2", waiting)]);
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&selectie=oferte&atentie=1");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Previzualizează oferta OF-q1" }));
    await waitFor(() => expect(search().get("oferta")).toBe("q1"));
    // Mode and filter stay next to the preview; closing it gives the same list.
    expect(search().get("selectie")).toBe("oferte");
    expect(search().get("atentie")).toBe("1");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(search().get("oferta")).toBeNull());
    expect(search().get("selectie")).toBe("oferte");
    // Away and back by the tab: the remembered context, without the preview.
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Cereri și oferte/));
    await waitFor(() => expect(search().get("atentie")).toBe("1"));
    expect(search().get("selectie")).toBe("oferte");
    expect(search().get("oferta")).toBeNull();
  });
});

describe("Lucrări · request photo as context, server counts", () => {
  it("shows the request photo marked as such, or a precise note when the request has several works", async () => {
    const photo = doc("Releveu", "PHOTO");
    worksBody = {
      works: {
        total: 2, page: 1, pageCount: 1,
        items: [
          workItem("job:j1", { title: "Recepție", requestPhotos: { requestId: "r1", photos: [photo], shared: false } }),
          workItem("job:j2", { title: "Depozit", request: { requestId: "r2", reference: "CER-2", title: "Depozit" }, requestPhotos: { requestId: "r2", photos: [photo, { ...photo, documentId: "p2" }], shared: true } }),
        ],
        totals: { all: 5, workos: 2, historical: 3 },
        facets: { years: [2026, 2021], yearCounts: [{ year: 2026, count: 4 }, { year: 2021, count: 1 }], states: [], sites: [{ siteId: "site:1", name: "Depozit", active: true, count: 2 }] },
      },
    };
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    render(<Harness />);
    // N-020 etapa 4 (644:12426 · 648:13594): the request photo is named as the request's, under the card's meta.
    const first = (await screen.findByRole("link", { name: "Deschide memoria lucrării: Recepție" })).closest("li")!;
    expect(within(first).getByText(/din cerere · nu e fotografia lucrării$/)).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Deschide fotografia din cerere Releveu" })).toBeInTheDocument();
    // Several works on the request: its photos are not shown on any of them, and the card says why.
    const second = screen.getByRole("link", { name: "Deschide memoria lucrării: Depozit" }).closest("li")!;
    expect(within(second).queryByRole("img")).toBeNull();
    expect(within(second).getByText("Fotografiile cererii sunt comune mai multor lucrări: nu sunt afișate aici")).toBeInTheDocument();
    // The An and Sediu counts are the server's.
    await userEvent.click(screen.getByRole("button", { name: "An" }));
    const years = within(screen.getByRole("list", { name: "An" })).getAllByRole("button").map((option) => option.textContent);
    expect(years).toEqual(["Toți anii", "20264", "20211"]);
    await userEvent.click(screen.getByRole("button", { name: "Sediu" }));
    expect(within(screen.getByRole("list", { name: "Sediu" })).getAllByRole("button").map((option) => option.textContent)).toEqual(["Toate sediile", "Depozit2"]);
  });
});
