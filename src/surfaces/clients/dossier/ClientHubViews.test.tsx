import { useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { navigate } from "../../../routing/navigate";
import { clientRequestsHref } from "../clientRequestsRoute";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 GO 11 · the views of the client hub after Istoric: Cereri și oferte with its selection in
 * the URL, Documente (year groups, preview vs download, the menu by permission, filters in the
 * URL), Sedii (a simulation is never the documented photo) and Date comerciale (read first,
 * "Modifică" by permission).
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const request = {
  requestId: "r1", title: "Casetă depozit", reference: "CER-1", customerId: "cus-1", customerDisplayName: "Alpha", status: "OPEN", statusLabel: "Deschisă",
  contextLabel: null, commercialProgress: null, createdAt: "2026-10-23T10:00:00.000Z", nextAction: "OPEN_REQUEST", nextActionLabel: "Deschide cererea", nextActionHref: null,
  needsAttention: false, attentionLabel: null, linkedQuoteSnapshotId: null, linkedQuoteProductCode: null, linkedAssemblyId: null,
};
const lonely = { ...request, requestId: "r2", title: "Totem parcare", reference: "CER-2" };
const quote = {
  quoteSnapshotId: "q1", kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay: "750,20", currency: "EUR",
  productCode: "P", productLabel: "Panou ACM", reference: "OF-1", inscription: "ALPHA", customerDisplayName: "Alpha", stage: "ORDER_CREATED", stageLabel: "Cu comandă",
  createdAt: null, nextAction: "NONE", nextActionLabel: "", needsAttention: false, attentionLabel: null, requestId: "r1", requestReference: "CER-1", orderSnapshotId: "ord-1",
};
const job = {
  jobId: "j1", kind: "PRODUCT", kindLabel: "Produs", productCode: "P", productLabel: "Panou ACM", inscription: "ALPHA", memberLabels: [], customerId: "cus-1", customerDisplayName: "Alpha",
  requestId: "r1", stage: "IN_PROGRESS", stageLabel: "În execuție", nextAction: "OPEN_EXECUTION", nextActionLabel: "", priority: "NORMAL", priorityLabel: "Standard", targetDate: null,
  targetDateLabel: "Fără termen", planningEditable: false, overdue: false, needsAttention: false, attentionLabel: null, progressLabel: null, createdAt: null, releaseSnapshotId: null,
  planId: null, orderSnapshotId: "ord-1",
};

const workspace = {
  workspace: {
    customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" },
    canCreateRequest: true,
    summary: { requestCount: 2, openRequestCount: 2, quoteCount: 1, jobCount: 1, historicalWorkCount: 0, workCount: 1 },
    requests: [request, lonely],
    quotes: [quote],
    jobs: [job],
  },
};

const doc = (id: string, overrides: Record<string, unknown>) => ({
  documentId: id, title: id, kind: "INVOICE", kindLabel: "Factură", photoStage: null, photoStageLabel: null, documentNumber: null, documentDate: "2026-10-09",
  description: null, originalFileName: `${id}.pdf`, sizeBytes: 2048, preview: "PDF", uploadedAt: "2026-10-09T00:00:00.000Z", revision: 1, links: [], viewHref: `/v/${id}`, downloadHref: `/d/${id}`,
  ...overrides,
});

const invoice = doc("Factură showroom", { documentNumber: "F-1342", links: [{ kind: "JOB", kindLabel: "Lucrare", subjectId: "j1", label: "Panou ACM" }] });
const contract = doc("Contract-cadru", { kind: "CONTRACT", kindLabel: "Contract", documentNumber: "CC-12/2025", documentDate: "2025-10-15" });
const loose = doc("Notă internă", { kind: "OTHER", kindLabel: "Altele", preview: "NONE", documentDate: null, uploadedAt: "2025-02-01T00:00:00.000Z" });
const simulation = doc("Simulare fațadă", { kind: "PHOTO", kindLabel: "Fotografie", photoStage: "SIMULATION", photoStageLabel: "Simulare", preview: "IMAGE", documentDate: "2026-10-20" });
const before = doc("Releveu fațadă", { kind: "PHOTO", kindLabel: "Fotografie", photoStage: "BEFORE", photoStageLabel: "Înainte", preview: "IMAGE", documentDate: "2026-09-02" });

let permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
let canEditTerms = true;

const dossier = () => ({
  dossier: {
    customerId: "cus-1",
    permissions,
    vocabulary: {
      documentKinds: [
        { value: "CONTRACT", label: "Contract" }, { value: "INVOICE", label: "Factură" }, { value: "OTHER", label: "Altele" }, { value: "PHOTO", label: "Fotografie" },
      ],
      photoStages: [], historyStates: [], maxFileBytes: 1,
    },
    sites: [{ siteId: "site:1", name: "Depozit Ghimbav", address: "DN1 km 7", city: "Ghimbav", contactName: "Sorin Dinu", phone: "0700 900 120", accessNotes: "Acces pe poarta 2.", status: "ACTIVE", statusLabel: "Activ", revision: 1, usage: { requests: 1, jobs: 1, historicalWorks: 0, documents: 1 } }],
    siteAssignments: [], documents: [invoice, contract, loose, simulation, before], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
});

const entry = {
  entryId: "project:r1", kind: "PROJECT", title: "Casetă depozit", reference: null, eventDateLabel: "23 oct. 2026", year: 2026, state: "EXECUTIE", stateLabel: "Execuție",
  provenance: "WORKOS", provenanceLabel: "În WorkOS", site: { siteId: "site:1", name: "Depozit Ghimbav", line: "Depozit Ghimbav", active: true }, siteAtTimeLabel: null, description: null,
  request: null, historicalWorkId: null, states: [], branches: [], documents: [invoice, simulation, before], photoCount: 2, matchedOn: [],
};

const history = {
  history: {
    total: 1, page: 1, pageCount: 1, entries: [entry],
    totals: { entries: 1, projects: 1, historicalWorks: 0, uploads: 0, documents: 3, photos: 2 },
    facets: { years: [2026], yearCounts: [{ year: 2026, count: 1 }], states: [], provenances: [], sites: [{ siteId: "site:1", name: "Depozit Ghimbav", active: true, count: 1 }] },
  },
};

const terms = () => ({
  terms: { revision: 1, recordedAt: "2026-10-01T10:00:00.000Z" },
  fields: {
    legalName: "Alpha Clima Demo SRL", registrationNumber: "J08/1234/2019", billingAddress: "Bd. Muncii 45", bankAccount: null, representativeName: "Mihai Ionescu", representativeRole: "Administrator",
    commercialContactName: "Andreea Pop", commercialContactPhone: "0700 900 110", commercialContactEmail: null, billingContactName: null, billingContactPhone: null, billingContactEmail: null,
    paymentTermDays: 30, advancePercent: 40, currency: "RON", referenceDocumentId: "Contract-cadru", notes: null,
  },
  labels: {
    legalName: "Denumire legală", registrationNumber: "Nr. Registrul Comerțului", billingAddress: "Adresă de facturare", bankAccount: "Cont bancar (IBAN)", representativeName: "Reprezentant",
    representativeRole: "Calitatea reprezentantului", commercialContactName: "Contact comercial", commercialContactPhone: "Telefon contact comercial", commercialContactEmail: "Email contact comercial",
    billingContactName: "Contact facturare", billingContactPhone: "Telefon contact facturare", billingContactEmail: "Email contact facturare", paymentTermDays: "Termen de plată (zile)",
    advancePercent: "Avans convenit (%)", currency: "Monedă", referenceDocumentId: "Contract de referință", notes: "Observații",
  },
  currencies: ["RON", "EUR"],
  referenceDocument: { documentId: "Contract-cadru", title: "Contract-cadru", documentNumber: "CC-12/2025" },
  revisions: [{ revision: 1, recordedAt: "2026-10-01T10:00:00.000Z" }],
  canEdit: canEditTerms,
  notice: "Date înregistrate pentru referință. Nu modifică ofertele, comenzile sau documentele acceptate.",
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
  permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
  canEditTerms = true;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/workspace")) return json(200, workspace);
    if (url.endsWith("/dossier")) return json(200, dossier());
    if (url.includes("/history")) return json(200, history);
    if (url.includes("/works")) return json(200, { works: { total: 1, page: 1, pageCount: 1, items: [], totals: { all: 1, workos: 1, historical: 0 }, facets: { years: [], yearCounts: [], states: [], sites: [{ siteId: "site:1", name: "Depozit Ghimbav", active: true, count: 1 }] } } });
    if (url.endsWith("/commercial-terms")) return json(200, terms());
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

describe("Cereri și oferte · one view, the selection in the URL", () => {
  it("Toate ofertele opens in the URL; refresh keeps it; Back returns to Istoric", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    const view = render(<Harness />);
    await screen.findByRole("heading", { level: 2, name: "Istoric" });
    // A link from Istoric opens Toate ofertele (640:12261) as a new entry.
    act(() => navigate(clientRequestsHref("cus-1", "oferte")));
    await waitFor(() => expect(search().get("selectie")).toBe("oferte"));
    const page = await screen.findByRole("region", { name: "Cereri și oferte" });
    expect(within(page).getByRole("button", { name: "Toate ofertele · 1 ofertă" })).toHaveAttribute("aria-pressed", "true");
    const row = within(page).getByRole("link", { name: "Deschide oferta OF-1" }).closest("li")!;
    // Amount and currency, the work made from its order (server ids) with its own stage, the request it belongs to.
    expect(within(row).getByText("750,20 EUR")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Lucrare · În execuție →" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&lucrare=job%3Aj1");
    expect(row.closest(".dreqflat")?.querySelector(".dreqflat__context")?.textContent).toBe("Cerere CER-1 · Casetă depozit");
    // Refresh: a new mount from the URL alone.
    view.unmount();
    resetResourceCache();
    render(<Harness />);
    expect(await screen.findByRole("button", { name: "Toate ofertele · 1 ofertă" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("lists every request, including one without an offer, and keeps the filter across modes", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri");
    render(<Harness />);
    const page = await screen.findByRole("region", { name: "Cereri și oferte" });
    const first = within(page).getByRole("heading", { level: 3, name: "Casetă depozit" }).closest("li")!;
    expect(within(first).getByText("1 ofertă cu comandă · lucrarea e în execuție")).toBeInTheDocument();
    // A request without an offer stays visible in Pe cereri (608:9487), with its way in.
    const second = within(page).getByRole("heading", { level: 3, name: "Totem parcare" }).closest("li")!;
    expect(within(second).getByText("Fără ofertă încă")).toBeInTheDocument();
    expect(within(second).getByText("Nicio ofertă încă pentru această cerere. Oferta se pregătește din pagina cererii.")).toBeInTheDocument();
    // Switching the mode replaces the entry; the search narrows in place.
    const before = window.history.length;
    await userEvent.click(within(page).getByRole("button", { name: "Toate ofertele · 1 ofertă" }));
    await waitFor(() => expect(search().get("selectie")).toBe("oferte"));
    expect(window.history.length).toBe(before);
    await userEvent.click(within(page).getByRole("button", { name: "Pe cereri · 2 cereri" }));
    await waitFor(() => expect(search().get("selectie")).toBeNull());
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută cereri și oferte" }), "totem");
    await waitFor(() => expect(search().get("q")).toBe("totem"));
    expect(await screen.findByText("1 din 2 cereri pentru „totem”")).toBeInTheDocument();
    expect(within(page).queryByRole("heading", { level: 3, name: "Casetă depozit" })).toBeNull();
  });
});

describe("Documente", () => {
  it("groups by year, separates preview from download and keeps the rarer actions in a menu", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    render(<Harness />);
    // N-020 etapa 5 (670:16320): one table, a year per group.
    expect(await screen.findByRole("columnheader", { name: /^2026/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /^2025/ })).toBeInTheDocument();
    // Photos are not documents here; they are counted towards Fotografii.
    expect(screen.getByText("3 documente · fotografiile sunt în Fotografii (2)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descarcă Factură showroom" })).toHaveAttribute("download");
    await userEvent.click(screen.getByRole("button", { name: "Previzualizează Factură showroom" }));
    const viewer = await screen.findByRole("dialog", { name: "Factură showroom" });
    await userEvent.click(within(viewer).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Factură showroom" })).toBeNull());
    // A file that cannot be shown in the page opens the viewer that says so; it can still be downloaded.
    const row = screen.getByText("Notă internă").closest("tr")!;
    expect(within(row).getByRole("button", { name: "Deschide Notă internă" })).toBeInTheDocument();
    expect(within(row).getAllByText("Doar în dosarul clientului").length).toBeGreaterThan(0);
    const more = within(row).getByRole("button", { name: "Alte acțiuni pentru Notă internă" });
    await userEvent.click(more);
    const menu = screen.getByRole("group", { name: "Alte acțiuni pentru Notă internă" });
    expect(within(menu).getByRole("button", { name: /Asociază/ })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /Modifică datele/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveFocus();
  });

  it("filters by attachment and site in the URL, says when nothing matches and clears", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&legat=NONE");
    render(<Harness />);
    expect(await screen.findByText("2 din 3 documente")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sediu" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Sediu" })).getByRole("button", { name: /Depozit Ghimbav/ }));
    await waitFor(() => expect(search().get("sediu")).toBe("site:1"));
    expect((await screen.findAllByText("0 din 3 documente")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Arată toate cele 3" }));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
    expect(await screen.findByText("3 documente · fotografiile sunt în Fotografii (2)")).toBeInTheDocument();
  });

  it("without the permission to edit, offers no menu", async () => {
    permissions = { ...permissions, editDocuments: false };
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    render(<Harness />);
    await screen.findByText("Notă internă");
    expect(screen.queryByRole("button", { name: /^Alte acțiuni pentru/ })).toBeNull();
  });
});

describe("Sedii", () => {
  it("never shows a simulation as the documented photo, and leads to the site's history, works, photos and documents", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=sedii");
    render(<Harness />);
    const site = (await screen.findByRole("heading", { level: 3, name: "Depozit Ghimbav" })).closest("li")!;
    const photo = await within(site).findByRole("button", { name: /Deschide ultima fotografie documentată/ });
    expect(within(photo).getByRole("img")).toHaveAttribute("src", "/v/Releveu fațadă");
    expect(within(site).getByText(/Înainte · 02.09.2026 · nu arată neapărat starea de azi/)).toBeInTheDocument();
    // Each number is what its destination shows when opened with this site.
    expect(await within(site).findByRole("link", { name: "Istoric · 1 la Depozit Ghimbav" })).toHaveAttribute("href", "/clienti/cus-1?sediu=site%3A1");
    expect(await within(site).findByRole("link", { name: "Lucrări · 1 la Depozit Ghimbav" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&sediu=site%3A1");
    expect(within(site).getByRole("link", { name: "Fotografii · 2 la Depozit Ghimbav" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=fotografii&sediu=site%3A1");
    expect(within(site).getByRole("link", { name: "Documente · 0 la Depozit Ghimbav" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=documente&sediu=site%3A1");
    expect(within(site).getByText("Atașate direct sediului: 0 documente · 0 fotografii")).toBeInTheDocument();
    expect(within(site).getByText("Acces pe poarta 2.")).toBeInTheDocument();
  });
});

describe("Fotografii · the viewer", () => {
  it("moves with the arrow keys, closes with Esc and returns the focus to the photo", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Harness />);
    const group = await screen.findByRole("region", { name: "Casetă depozit" });
    // Inside a project: before → simulation (→ after), each photo with its stage.
    const photos = within(group).getAllByRole("button", { name: /^Deschide fotografia/ });
    expect(photos.map((button) => button.getAttribute("aria-label"))).toEqual(["Deschide fotografia 1 din 2: Înainte · Releveu fațadă", "Deschide fotografia 2 din 2: Simulare · Simulare fațadă"]);
    await userEvent.click(photos[0]!);
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByText(/1 din 2/)).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(within(viewer).getByText(/2 din 2/)).toBeInTheDocument();
    // Esc on a modal <dialog> is the browser cancel event (jsdom does not raise it from the key).
    fireEvent(viewer, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The focus returns to the photo shown last: the second one, reached with the arrow.
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Casetă depozit" })).getAllByRole("button", { name: /^Deschide fotografia/ })[1]).toHaveFocus());
  });
});

describe("Date comerciale", () => {
  it("opens to read, grouped, and edits only after Modifică", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=comercial");
    render(<Harness />);
    const identity = await screen.findByRole("region", { name: "Identitate și facturare" });
    expect(within(identity).getByText("Alpha Clima Demo SRL")).toBeInTheDocument();
    // The representative and the role on two lines (720:185); an unknown value reads "necompletat".
    expect(within(identity).getByText("Administrator")).toBeInTheDocument();
    expect(within(identity).getAllByText("necompletat").length).toBeGreaterThan(0);
    const conditions = screen.getByRole("region", { name: "Condiții" });
    expect(within(conditions).getByText("30 de zile")).toBeInTheDocument();
    expect(within(conditions).getByText("40%")).toBeInTheDocument();
    expect(within(conditions).getByText(/CC-12\/2025/)).toBeInTheDocument();
    // Reference data: it does not apply to offers by itself.
    expect(screen.getByText(/Nu modifică ofertele, comenzile sau documentele acceptate\./)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Modifică datele" }));
    const form = screen.getByRole("form", { name: "Modifică datele comerciale" });
    expect(within(form).getByRole("button", { name: "Salvează datele comerciale" })).toBeDisabled();
    await userEvent.type(within(form).getByLabelText("Cont bancar (IBAN)"), "RO49");
    expect(within(form).getByRole("button", { name: "Salvează datele comerciale" })).toBeEnabled();
    await userEvent.click(within(form).getByRole("button", { name: "Renunță la modificări" }));
    expect(await screen.findByRole("region", { name: "Identitate și facturare" })).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("without the permission, reads only", async () => {
    canEditTerms = false;
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=comercial");
    render(<Harness />);
    await screen.findByRole("region", { name: "Identitate și facturare" });
    expect(screen.getByText("Doar citire")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifică datele" })).toBeNull();
  });
});
