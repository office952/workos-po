import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 etapa 5 · Documente: the list, the one viewer in the address, upload with its locked and
 * failed states, metadata with a version conflict, associations one by one with a partial result,
 * and removal with a confirmation — all through the server's real routes (mocked here).
 */
type Reply = { status: number; body?: unknown; blob?: Blob };
const reply = ({ status, body = null, blob }: Reply) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => blob ?? new Blob(["%PDF-1.4"], { type: "application/pdf" }), headers: new Headers() });

const doc = (documentId: string, overrides: Record<string, unknown> = {}) => ({
  documentId,
  title: `Document ${documentId}`,
  kind: "INVOICE",
  kindLabel: "Factură",
  photoStage: null,
  photoStageLabel: null,
  documentNumber: `F-${documentId}`,
  documentDate: "2025-11-20",
  description: null as string | null,
  originalFileName: `${documentId}.pdf`,
  sizeBytes: 10_000,
  preview: "PDF",
  uploadedAt: "2026-10-24T10:00:00.000Z",
  revision: 1,
  links: [],
  viewHref: `/api/customers/cus-1/documents/${documentId}/content?disposition=inline`,
  downloadHref: `/api/customers/cus-1/documents/${documentId}/content?disposition=attachment`,
  ...overrides,
});

let docs: Array<ReturnType<typeof doc>>;
let permissions: Record<string, boolean>;
let calls: Array<{ method: string; url: string; body?: unknown }>;
let behaviour: { content: number[]; upload: Array<number | "hold">; patch: Array<{ status: number; body?: unknown; then?: () => void }>; link: number[]; unlink: number[] };
let releaseUpload: (() => void) | null;

const dossierBody = () => ({
  dossier: {
    customerId: "cus-1",
    permissions,
    vocabulary: { documentKinds: [{ value: "CONTRACT", label: "Contract" }, { value: "INVOICE", label: "Factură" }, { value: "PHOTO", label: "Fotografie" }, { value: "OTHER", label: "Alt document" }], photoStages: [], historyStates: [], maxFileBytes: 50 * 1024 * 1024 },
    sites: [{ siteId: "s1", name: "Depozit Ghimbav", status: "ACTIVE", statusLabel: "Activ", address: "DN1 km 7", city: "Ghimbav", revision: 1, usage: { requests: 0, jobs: 0, historicalWorks: 1, documents: 0 } }],
    siteAssignments: [],
    documents: docs,
    historicalWorks: [{ workId: "h2021", title: "Litere 2021", eventDate: "2021-06", eventDateEnd: null, reference: "AC-2021-014", description: null, siteId: "s1", revision: 1 }],
    linkTargets: {
      requests: [{ subjectId: "r1", label: "CER-4C3E1233 · Casetă luminoasă depozit Alpha" }],
      jobs: [],
      historicalWorks: [{ subjectId: "h2021", label: "Litere 2021 (2021)" }, { subjectId: "h2025", label: "Autocolant vitrine (2025)" }],
      sites: [{ subjectId: "s1", label: "Depozit Ghimbav" }],
    },
  },
});

function Harness() {
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    const update = () => setLocation(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  void location;
  return <ClientDetailPage customerId="cus-1" search={window.location.search} />;
}

beforeEach(() => {
  docs = [
    doc("f2021", { title: "Factură litere și casetă depozit", documentNumber: "F-ALC-2021-0412", documentDate: "2021-07-02", links: [{ kind: "HISTORICAL_WORK", kindLabel: "Lucrare istorică", subjectId: "h2021", label: "Litere 2021" }] }),
    doc("f2025", { title: "Factură autocolant vitrine", documentNumber: "F-ALC-2025-1187", links: [{ kind: "HISTORICAL_WORK", kindLabel: "Lucrare istorică", subjectId: "h2025", label: "Autocolant vitrine" }] }),
    doc("letter", { title: "Corespondență programare montaj", kind: "OTHER", kindLabel: "Alt document", documentNumber: null, documentDate: null, preview: "NONE", originalFileName: "scrisoare.docx" }),
  ];
  permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
  calls = [];
  behaviour = { content: [], upload: [], patch: [], link: [], unlink: [] };
  releaseUpload = null;
  sessionStorage.clear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:doc", revokeObjectURL: () => undefined }));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      if (url.endsWith("/workspace")) {
        return reply({ status: 200, body: { workspace: { customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" }, canCreateRequest: true, summary: { requestCount: 0, openRequestCount: 0, quoteCount: 0, jobCount: 0, historicalWorkCount: 2, workCount: 2 }, requests: [], quotes: [], jobs: [] } } });
      }
      if (url.endsWith("/dossier")) return reply({ status: 200, body: dossierBody() });
      if (url.includes("/history")) return reply({ status: 200, body: { customerId: "cus-1", history: { total: 0, page: 1, pageCount: 1, entries: [], totals: { entries: 0, projects: 0, historicalWorks: 0, uploads: 0, documents: docs.length, photos: 0 }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } } });
      if (url.includes("/content")) return reply({ status: behaviour.content.shift() ?? 200 });
      if (method === "POST" && url.endsWith("/documents")) {
        const next = behaviour.upload.shift() ?? 201;
        if (next === "hold") return new Promise((resolve) => { releaseUpload = () => resolve(reply({ status: 201, body: { documentId: "new" } })); }).then((value) => value);
        return reply({ status: next, body: next >= 400 ? { error: "storage_unavailable" } : { documentId: "new" } });
      }
      if (method === "PATCH") {
        const next = behaviour.patch.shift() ?? { status: 200, body: { revision: 2 } };
        next.then?.();
        return reply(next);
      }
      if (method === "POST" && url.endsWith("/links")) return reply({ status: behaviour.link.shift() ?? 201, body: {} });
      if (method === "DELETE") return reply({ status: behaviour.unlink.shift() ?? 200, body: {} });
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

const search = () => new URLSearchParams(window.location.search);

describe("Documente · list and viewer (670:16320 · 707:22391)", () => {
  it("finds the 2021 invoice, opens it in the address, shows its facts and gives the focus back on close (route 1)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    render(<Harness />);
    expect(await screen.findByText("3 documente")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută documente" }), "F-ALC-2021");
    expect(await screen.findByText("1 din 3 documente pentru „F-ALC-2021”")).toBeInTheDocument();
    const open = screen.getByRole("button", { name: "Previzualizează Factură litere și casetă depozit" });
    await userEvent.click(open);
    await waitFor(() => expect(search().get("document")).toBe("f2021"));
    const viewer = await screen.findByRole("dialog", { name: "Factură litere și casetă depozit" });
    expect(within(viewer).getByText("F-ALC-2021-0412")).toBeInTheDocument();
    expect(within(viewer).getByText("Fișierul încărcat nu dovedește încasarea.")).toBeInTheDocument();
    expect(within(viewer).getByRole("link", { name: "Lucrare istorică · Litere 2021 →" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&lucrare=h2021");
    expect(await within(viewer).findByTitle("Previzualizare Factură litere și casetă depozit")).toHaveAttribute("src", "blob:doc");
    expect(within(viewer).getByRole("link", { name: "Descarcă" })).toHaveAttribute("href", "/api/customers/cus-1/documents/f2021/content?disposition=attachment");
    await userEvent.click(within(viewer).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(search().get("document")).toBeNull());
    expect(search().get("q")).toBe("F-ALC-2021");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Previzualizează Factură litere și casetă depozit" })));
  });

  it("opens a document from a direct link even when the list remembers a search", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&q=autocolant");
    const view = render(<Harness />);
    expect(await screen.findByText("1 din 3 documente pentru „autocolant”")).toBeInTheDocument();
    view.unmount();
    resetResourceCache();
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2021");
    render(<Harness />);
    expect(await screen.findByRole("dialog", { name: "Factură litere și casetă depozit" })).toBeInTheDocument();
    expect(search().get("document")).toBe("f2021");
  });

  it("says when the file cannot be read, with a retry, and when it is missing; a file without preview says so", async () => {
    behaviour.content = [503, 200];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    const view = render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    expect(await within(viewer).findByText("Documentul nu a putut fi încărcat.")).toBeInTheDocument();
    await userEvent.click(within(viewer).getByRole("button", { name: "Încearcă din nou" }));
    expect(await within(viewer).findByTitle("Previzualizare Factură autocolant vitrine")).toBeInTheDocument();
    view.unmount();
    resetResourceCache();
    behaviour.content = [410];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2021");
    render(<Harness />);
    expect(await screen.findByText("Fișierul nu mai poate fi deschis.")).toBeInTheDocument();
  });

  it("presents an undated document as such, and a file without preview as a download", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=letter");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Corespondență programare montaj" });
    expect(within(viewer).getByText("Fără previzualizare")).toBeInTheDocument();
    expect(within(viewer).getByText("Fără dată — documentul nu are o dată declarată")).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("/letter/content"))).toBe(false);
  });

  it("hides upload, Asociază and Modifică without the permissions", async () => {
    permissions = { ...permissions, uploadDocuments: false, editDocuments: false };
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    expect(within(viewer).queryByRole("button", { name: "Asociază" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Încarcă document/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Alte acțiuni pentru/ })).toBeNull();
  });
});

describe("Documente · upload (672:16509 → 672:17372)", () => {
  it("locks the form while the upload is on its way, keeps the values on a failure and succeeds on the retry (route 3)", async () => {
    behaviour.upload = [503, "hold"];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: /Încarcă document/ }));
    const dialog = await screen.findByRole("dialog", { name: "Încarcă document" });
    await userEvent.upload(within(dialog).getByLabelText("Fișier *"), new File(["%PDF"], "contract-cadru.pdf", { type: "application/pdf" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Tip *"), "CONTRACT");
    await userEvent.type(within(dialog).getByLabelText("Titlu"), "Contract-cadru semnat");
    await userEvent.click(within(dialog).getByLabelText("Depozit Ghimbav"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Încarcă" }));
    expect(await within(dialog).findByText("Nu s-a încărcat")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Titlu")).toHaveValue("Contract-cadru semnat");
    expect(within(dialog).getByLabelText("Depozit Ghimbav")).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Încearcă din nou" }));
    // On its way: one request only, the form locked, the dialog cannot be closed.
    expect(await within(dialog).findByText("Trimiterea e blocată până la răspuns.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Se încarcă…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Închide formularul" })).toBeDisabled();
    expect(calls.filter((call) => call.method === "POST" && call.url.endsWith("/documents"))).toHaveLength(2);
    const dossierReads = calls.filter((call) => call.url.endsWith("/dossier")).length;
    releaseUpload?.();
    expect(await within(dialog).findByText("Documentul a fost încărcat")).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((call) => call.url.endsWith("/dossier")).length).toBeGreaterThan(dossierReads));
  });
});

describe("Documente · metadata conflict (756:460 → 756:840 → 773:185)", () => {
  it("keeps the draft on a conflict, compares, resumes on the current version and saves on it (route 4)", async () => {
    behaviour.patch = [
      { status: 409, body: { error: "stale_revision" }, then: () => { docs[1] = { ...docs[1]!, revision: 2, description: "Factură autocolant vitrine showroom (corectată)." }; } },
      { status: 200, body: { revision: 3 } },
    ];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    await userEvent.click(within(viewer).getByRole("button", { name: "Modifică datele" }));
    const form = await screen.findByRole("dialog", { name: "Modifică datele documentului" });
    await userEvent.clear(within(form).getByLabelText("Titlu *"));
    await userEvent.type(within(form).getByLabelText("Titlu *"), "Factură autocolant vitrine — campania de iarnă");
    await userEvent.click(within(form).getByRole("button", { name: "Salvează" }));
    expect(await within(form).findByText("Altcineva a modificat datele acestui document între timp.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Titlu *")).toHaveValue("Factură autocolant vitrine — campania de iarnă");
    await userEvent.click(within(form).getByRole("button", { name: "Compară cu versiunea actuală" }));
    expect(within(form).getByText("Doar câmpurile care diferă")).toBeInTheDocument();
    expect(within(form).getByText("Factură autocolant vitrine showroom (corectată).")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Reia editarea pe versiunea actuală" }));
    expect(within(form).getByText("Editezi acum pe versiunea actuală.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Titlu *")).toHaveValue("Factură autocolant vitrine — campania de iarnă");
    expect(within(form).getByLabelText("Descriere")).toHaveValue("Factură autocolant vitrine showroom (corectată).");
    await userEvent.click(within(form).getByRole("button", { name: "Salvează" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Modifică datele documentului" })).toBeNull());
    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches.map((call) => (call.body as { expectedRevision: number }).expectedRevision)).toEqual([1, 2]);
    expect((patches[1]!.body as { title: string; description: string }).description).toBe("Factură autocolant vitrine showroom (corectată).");
  });

  it("keeps the values and offers a retry when the save fails for another reason", async () => {
    behaviour.patch = [{ status: 503, body: { error: "storage_unavailable" } }];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    await userEvent.click(within(viewer).getByRole("button", { name: "Modifică datele" }));
    const form = await screen.findByRole("dialog", { name: "Modifică datele documentului" });
    await userEvent.type(within(form).getByLabelText("Descriere"), "Nota nouă");
    await userEvent.click(within(form).getByRole("button", { name: "Salvează" }));
    expect(await within(form).findByText("Nu s-a salvat")).toBeInTheDocument();
    expect(within(form).getByLabelText("Descriere")).toHaveValue("Nota nouă");
    expect(within(form).getByRole("button", { name: "Încearcă din nou" })).toBeEnabled();
    expect(within(form).queryByText(/Altcineva/)).toBeNull();
  });
});

describe("Documente · associations (758:185 → 758:2610)", () => {
  it("adds each association separately, says which were saved and retries only the one that failed (route 5)", async () => {
    behaviour.link = [201, 503, 201, 201];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    await userEvent.click(within(viewer).getByRole("button", { name: "Asociază" }));
    const dialog = await screen.findByRole("dialog", { name: "Asociază „Factură autocolant vitrine”" });
    expect(within(dialog).getByText("Asocieri salvate · 1")).toBeInTheDocument();
    for (const word of ["casetă", "ghimbav", "litere"]) {
      await userEvent.type(within(dialog).getByRole("searchbox", { name: "Caută lucrări, cereri sau sedii de adăugat" }), word);
      await userEvent.click(within(dialog).getAllByRole("button", { name: /^Adaugă în selecție/ })[0]!);
    }
    expect(within(dialog).getByText("De adăugat · 3 selectate, nesalvate")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Adaugă asocierile selectate (3)" }));
    expect(await within(dialog).findByText("2 din 3 asocieri au fost adăugate. Una nu s-a adăugat.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reîncearcă asocierea nereușită (1)" })).toBeInTheDocument();
    const before = calls.filter((call) => call.method === "POST" && call.url.endsWith("/links")).length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă asocierea nereușită (1)" }));
    expect(await within(dialog).findByText("Asocierea a fost adăugată.")).toBeInTheDocument();
    const links = calls.filter((call) => call.method === "POST" && call.url.endsWith("/links"));
    expect(links.length - before).toBe(1);
    expect(links.map((call) => (call.body as { subjectId: string }).subjectId)).toEqual(["r1", "s1", "h2021", "s1"]);
  });

  it("asks before removing an association, then applies it by itself and says so (route 6)", async () => {
    behaviour.unlink = [503, 200];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    await userEvent.click(within(viewer).getByRole("button", { name: "Asociază" }));
    const dialog = await screen.findByRole("dialog", { name: "Asociază „Factură autocolant vitrine”" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimină asocierea cu Autocolant vitrine" }));
    expect(within(dialog).getByText(/Elimini asocierea cu Autocolant vitrine\? Se aplică imediat/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimină asocierea" }));
    expect(await within(dialog).findByText(/Eliminarea nu s-a aplicat. Asocierea a rămas salvată./)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă eliminarea" }));
    expect(await within(dialog).findByText(/Asocierea cu Autocolant vitrine a fost eliminată./)).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(2);
  });
});

// 760:213 · A02 · 673:17851: the document's identity and the close button stay in a header, the
// answer of the server and the actions in a bar at the bottom; only the body between them scrolls.
describe("Documente · dialog frame (760:213)", () => {
  const barOf = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(".cdos-bar")!;
  const headerOf = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(":scope > .creation-dialog__header")!;

  it("keeps the partial result's explanation and actions in the bar, the identity in the header, and gives the focus back on close", async () => {
    behaviour.link = [201, 503];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    const opener = within(viewer).getByRole("button", { name: "Asociază" });
    await userEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Asociază „Factură autocolant vitrine”" });
    expect(dialog).toHaveAttribute("data-frame");
    expect(within(headerOf(dialog)).getByText("Factură · F-ALC-2025-1187 · 20.11.2025")).toBeInTheDocument();
    expect(within(headerOf(dialog)).getByRole("button", { name: "Închide formularul" })).toBeInTheDocument();
    for (const word of ["casetă", "ghimbav"]) {
      await userEvent.type(within(dialog).getByRole("searchbox", { name: "Caută lucrări, cereri sau sedii de adăugat" }), word);
      await userEvent.click(within(dialog).getAllByRole("button", { name: /^Adaugă în selecție/ })[0]!);
    }
    await userEvent.click(within(barOf(dialog)).getByRole("button", { name: "Adaugă asocierile selectate (2)" }));
    expect(await within(dialog).findByText("1 din 2 asocieri au fost adăugate. Una nu s-a adăugat.")).toBeInTheDocument();
    const bar = barOf(dialog);
    expect(within(bar).getByText(/^„Închide” lasă salvate cele 1 asocieri adăugate/)).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Reîncearcă asocierea nereușită (1)" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Închide" })).toBeInTheDocument();
    // The saved and the failed rows stay in the scrolling body, not in the bar.
    expect(bar.querySelector(".ddoclinks__row")).toBeNull();
    // „Închide” gives up the failed selection only; the saved association is not undone.
    await userEvent.click(within(bar).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Asociază „Factură autocolant vitrine”" })).toBeNull());
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(opener).toHaveFocus();
  });

  it("gives the focus back to „⋯” on a phone, where the menu item that opened the dialog is gone", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width: 767px"), media: query, addEventListener() {}, removeEventListener() {} }));
    try {
      window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
      render(<Harness />);
      const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
      const more = within(viewer).getByRole("button", { name: "Alte acțiuni pentru Factură autocolant vitrine" });
      await userEvent.click(more);
      await userEvent.click(within(viewer).getByRole("button", { name: "Asociază" }));
      const dialog = await screen.findByRole("dialog", { name: "Asociază „Factură autocolant vitrine”" });
      await userEvent.click(within(barOf(dialog)).getByRole("button", { name: "Închide" }));
      await waitFor(() => expect(more).toHaveFocus());
      await userEvent.click(more);
      await userEvent.click(within(viewer).getByRole("button", { name: "Modifică datele" }));
      const form = await screen.findByRole("dialog", { name: "Modifică datele documentului" });
      await userEvent.click(within(barOf(form)).getByRole("button", { name: "Renunță" }));
      await waitFor(() => expect(more).toHaveFocus());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a conflict's message and its choices together in the bar, the file name in the header", async () => {
    behaviour.patch = [{ status: 409, body: { error: "stale_revision" }, then: () => { docs[1] = { ...docs[1]!, revision: 2, description: "Altă descriere." }; } }];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&document=f2025");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog", { name: "Factură autocolant vitrine" });
    await userEvent.click(within(viewer).getByRole("button", { name: "Modifică datele" }));
    const form = await screen.findByRole("dialog", { name: "Modifică datele documentului" });
    expect(form).toHaveAttribute("data-frame");
    expect(within(headerOf(form)).getByText("f2025.pdf")).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText("Descriere"), " nouă");
    await userEvent.click(within(barOf(form)).getByRole("button", { name: "Salvează" }));
    const bar = barOf(form);
    expect(await within(bar).findByText("Altcineva a modificat datele acestui document între timp.")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Compară cu versiunea actuală" })).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole("button", { name: "Compară cu versiunea actuală" }));
    expect(within(barOf(form)).getByRole("button", { name: "Reia editarea pe versiunea actuală" })).toBeInTheDocument();
    expect(within(barOf(form)).getByRole("button", { name: "Folosește versiunea actuală" })).toBeInTheDocument();
  });

  it("keeps the upload's error, retry and wait message in the bar, with the close button locked while it is on its way", async () => {
    behaviour.upload = [503, "hold"];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: /Încarcă document/ }));
    const dialog = await screen.findByRole("dialog", { name: "Încarcă document" });
    expect(dialog).toHaveAttribute("data-frame");
    await userEvent.upload(within(dialog).getByLabelText("Fișier *"), new File(["%PDF"], "contract-cadru.pdf", { type: "application/pdf" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Tip *"), "CONTRACT");
    await userEvent.click(within(barOf(dialog)).getByRole("button", { name: "Încarcă" }));
    expect(await within(barOf(dialog)).findByText("Nu s-a încărcat")).toBeInTheDocument();
    // Each answer takes the focus: the pressed button is disabled while the upload is on its way.
    await waitFor(() => expect(within(barOf(dialog)).getByText("Nu s-a încărcat").closest(".ddocupload__done")).toHaveFocus());
    await userEvent.click(within(barOf(dialog)).getByRole("button", { name: "Încearcă din nou" }));
    expect(await within(barOf(dialog)).findByText("Trimiterea e blocată până la răspuns.")).toBeInTheDocument();
    await waitFor(() => expect(within(barOf(dialog)).getByText("Trimiterea e blocată până la răspuns.")).toHaveFocus());
    expect(within(headerOf(dialog)).getByRole("button", { name: "Închide formularul" })).toBeDisabled();
    releaseUpload?.();
    expect(await within(dialog).findByText("Documentul a fost încărcat")).toBeInTheDocument();
    // The pressed button is now disabled (no file): the answer takes the focus instead of the page.
    await waitFor(() => expect(dialog.querySelector(".ddocupload__done")).toHaveFocus());
  });
});

describe("Documente · context (route 7)", () => {
  it("keeps the search and filters across a tab and a refresh, and a reset stays a reset", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente&tip=INVOICE&an=2021");
    const view = render(<Harness />);
    expect(await screen.findByText("1 din 3 documente")).toBeInTheDocument();
    const tab = (name: RegExp) => within(screen.getByRole("navigation", { name: "Secțiuni client" })).getByRole("link", { name });
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(search().get("tip")).toBe("INVOICE"));
    expect(search().get("an")).toBe("2021");
    await userEvent.click(await screen.findByRole("button", { name: "Arată toate cele 3" }));
    await waitFor(() => expect(search().get("tip")).toBeNull());
    view.unmount();
    resetResourceCache();
    render(<Harness />);
    expect(await screen.findByText("3 documente")).toBeInTheDocument();
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(search().get("sectiune")).toBe("documente"));
    expect(search().get("tip")).toBeNull();
  });
});
