import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { navigate } from "../../../routing/navigate";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 etapa 8 · Date comerciale through the server's routes (mocked here): reading with the
 * sources, a save with the confirmed values, a failure and a refused field that keep every value,
 * two version conflicts resumed on the current version (the Figma case: 45 days kept, the billing
 * phone taken from the other version), taking the current version, leaving with and without
 * changes, the phone form, read-only access and a client without commercial data.
 */
type Reply = { status: number; body?: unknown };
const reply = ({ status, body = null }: Reply) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([""]), headers: new Headers() });

const LABELS = {
  legalName: "Denumire legală",
  registrationNumber: "Nr. Registrul Comerțului",
  billingAddress: "Adresă de facturare",
  bankAccount: "Cont bancar (IBAN)",
  representativeName: "Reprezentant",
  representativeRole: "Calitatea reprezentantului",
  commercialContactName: "Contact comercial",
  commercialContactPhone: "Telefon contact comercial",
  commercialContactEmail: "Email contact comercial",
  billingContactName: "Contact facturare",
  billingContactPhone: "Telefon contact facturare",
  billingContactEmail: "Email contact facturare",
  paymentTermDays: "Termen de plată (zile)",
  advancePercent: "Avans convenit (%)",
  currency: "Monedă",
  referenceDocumentId: "Contract de referință",
  notes: "Observații",
};
type Fields = Record<keyof typeof LABELS, string | number | null>;
const FIRST: Fields = {
  legalName: "Alpha Clima Demo SRL",
  registrationNumber: "J08/1234/2019",
  billingAddress: "Bd. Muncii 45, Brașov",
  bankAccount: null,
  representativeName: "Mihai Ionescu",
  representativeRole: "Administrator",
  commercialContactName: "Andreea Pop",
  commercialContactPhone: "0700 900 110",
  commercialContactEmail: "comercial@alpha-clima.demo.test",
  billingContactName: "Ioana Rusu",
  billingContactPhone: "0700 900 111",
  billingContactEmail: "facturare@alpha-clima.demo.test",
  paymentTermDays: 30,
  advancePercent: 40,
  currency: "RON",
  referenceDocumentId: "doc-c1",
  notes: "DEMO — fără valoare comercială.",
};
const EMPTY = Object.fromEntries(Object.keys(LABELS).map((key) => [key, null])) as Fields;

let versions: Array<{ revision: number; recordedAt: string; fields: Fields }>;
let canEdit: boolean;
let puts: Array<Record<string, unknown>>;
let next: Array<{ status: number; field?: string; then?: () => void }>;
let documents: Array<Record<string, unknown>>;

const current = () => versions[versions.length - 1] ?? null;
const termsOf = (version: (typeof versions)[number]) => ({ ...version.fields, customerId: "cus-1", revision: version.revision, recordedAt: version.recordedAt, recordedByAccountId: "acct-1" });
const record = (fields: Partial<Fields>) => {
  const last = current();
  versions = [...versions, { revision: (last?.revision ?? 0) + 1, recordedAt: `2026-10-25T10:0${versions.length}:00.000Z`, fields: { ...(last?.fields ?? EMPTY), ...fields } }];
};

const contract = { documentId: "doc-c1", kind: "CONTRACT", kindLabel: "Contract", title: "Contract-cadru de prestări servicii", documentNumber: "CC-12/2025", documentDate: "2025-03-01", originalFileName: "cc.pdf", mimeType: "application/pdf", sizeBytes: 10, preview: "PDF", viewHref: "/f", downloadHref: "/d", links: [], revision: 1 };
const addendum = { ...contract, documentId: "doc-a1", kind: "ADDENDUM", kindLabel: "Act adițional", title: "Act adițional 1", documentNumber: "AA-1/2026" };
const invoice = { ...contract, documentId: "doc-f1", kind: "INVOICE", kindLabel: "Factură", title: "Factură avans", documentNumber: "F-ALC-2026-1" };

function Harness() {
  const [, setLocation] = useState(() => window.location.search);
  useEffect(() => {
    const update = () => setLocation(window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return <ClientDetailPage customerId="cus-1" search={window.location.search} />;
}

function phoneScreen(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: on && query === "(max-width: 767px)", media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined })),
  );
}

beforeEach(() => {
  versions = [{ revision: 1, recordedAt: "2026-10-24T06:36:00.000Z", fields: { ...FIRST } }];
  canEdit = true;
  documents = [contract, addendum];
  puts = [];
  next = [];
  sessionStorage.clear();
  window.history.replaceState({}, "", "/clienti/cus-1?sectiune=comercial");
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/workspace")) {
        return reply({
          status: 200,
          body: { workspace: { customer: { customerId: "cus-1", displayName: "Alpha Clima Demo SRL", status: "ACTIVE", cui: "RO90190002", contactName: "Mihai Ionescu", phone: "0700 900 102", email: "office@alpha-clima.demo.test" }, canCreateRequest: true, summary: { requestCount: 0, openRequestCount: 0, quoteCount: 0, jobCount: 0, historicalWorkCount: 0, workCount: 0 }, requests: [], quotes: [], jobs: [] } },
        });
      }
      if (url.endsWith("/dossier")) {
        return reply({
          status: 200,
          body: {
            dossier: {
              customerId: "cus-1",
              permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: canEdit },
              vocabulary: { documentKinds: [{ value: "CONTRACT", label: "Contract" }, { value: "ADDENDUM", label: "Act adițional" }, { value: "INVOICE", label: "Factură" }], photoStages: [], historyStates: [], maxFileBytes: 1 },
              sites: [],
              siteAssignments: [],
              documents,
              historicalWorks: [],
              linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
            },
          },
        });
      }
      if (url.includes("/history")) return reply({ status: 200, body: { customerId: "cus-1", history: { total: 0, page: 1, pageCount: 1, entries: [], totals: { entries: 0, projects: 0, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } } });
      if (url.includes("/works")) return reply({ status: 200, body: { works: { total: 0, page: 1, pageCount: 1, items: [], totals: { all: 0, workos: 0, historical: 0 }, facets: { years: [], yearCounts: [], states: [], sites: [] } } } });
      if (url.endsWith("/commercial-terms") && method === "GET") {
        const last = current();
        return reply({
          status: 200,
          body: {
            terms: last ? termsOf(last) : null,
            fields: last?.fields ?? EMPTY,
            labels: LABELS,
            currencies: ["RON", "EUR"],
            referenceDocument: last?.fields.referenceDocumentId === "doc-c1" ? { documentId: "doc-c1", title: contract.title, documentNumber: contract.documentNumber } : null,
            revisions: [...versions].reverse().map((item) => ({ revision: item.revision, recordedAt: item.recordedAt })),
            canEdit,
            notice: "Date înregistrate pentru referință. Nu modifică ofertele, comenzile sau documentele acceptate.",
          },
        });
      }
      if (url.endsWith("/commercial-terms") && method === "PUT") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        puts.push(body);
        const step = next.shift() ?? { status: 200 };
        step.then?.();
        if (step.status === 409 || body.expectedRevision !== (current()?.revision ?? 0)) return reply({ status: 409, body: { error: "stale_revision", terms: current() ? termsOf(current()!) : null } });
        if (step.status === 400) return reply({ status: 400, body: { error: "invalid_payload", field: step.field } });
        if (step.status >= 500) return reply({ status: step.status, body: { error: "storage_unavailable" } });
        const { expectedRevision: _ignored, ...input } = body;
        void _ignored;
        const fields = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, (key === "paymentTermDays" || key === "advancePercent") && value !== null ? Number(value) : value])) as Partial<Fields>;
        record(fields);
        return reply({ status: 200, body: { alreadyApplied: false, terms: termsOf(current()!) } });
      }
      return reply({ status: 404, body: {} });
    }),
  );
  phoneScreen(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function openForm() {
  await userEvent.click(await screen.findByRole("button", { name: "Modifică datele" }));
  return screen.getByRole("form", { name: "Modifică datele comerciale" });
}

async function setValue(form: HTMLElement, label: string, value: string) {
  const field = within(form).getByLabelText(label);
  await userEvent.clear(field);
  if (value) await userEvent.type(field, value);
}

describe("Date comerciale · reading (720:185)", () => {
  it("groups the values, says where CUI and the principal contact come from, and opens the contracts in Documente", async () => {
    render(<Harness />);
    const identity = await screen.findByRole("region", { name: "Identitate și facturare" });
    expect(within(identity).getByText("RO90190002")).toBeInTheDocument();
    expect(within(identity).getAllByText("din fișa clientului")).toHaveLength(1);
    expect(within(identity).getByText("necompletat")).toBeInTheDocument();
    const contacts = screen.getByRole("region", { name: "Contacte" });
    expect(within(contacts).getByText("office@alpha-clima.demo.test")).toBeInTheDocument();
    expect(within(contacts).getByText("Andreea Pop")).toBeInTheDocument();
    expect(screen.getByText(/^revizia 1 · 24\.10\.2026, \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByText("Contractele și actele adiționale ale clientului sunt în Documente: 1 contract · 1 act adițional.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide în Documente →" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=documente&tip=CONTRACT%2CADDENDUM");
    // The reference contract opens in the common viewer; the address keeps the page underneath.
    await userEvent.click(screen.getByRole("button", { name: "Previzualizează documentul →" }));
    expect(window.location.search).toBe("?sectiune=comercial&document=doc-c1");
  });

  it("without the permission, reads only; without any version, says so", async () => {
    canEdit = false;
    versions = [];
    render(<Harness />);
    expect(await screen.findByText("Nicio dată comercială înregistrată")).toBeInTheDocument();
    expect(screen.getByText("Doar citire")).toBeInTheDocument();
    expect(screen.getByText("nicio versiune salvată")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifică|Completează/ })).toBeNull();
  });
});

describe("Date comerciale · saving (734:185 → 721:185 → 767:185)", () => {
  it("sends one request, then shows the values the server confirmed and the new revision", async () => {
    render(<Harness />);
    const form = await openForm();
    expect(within(form).getByLabelText("Denumire legală")).toHaveFocus();
    await setValue(form, "Termen de plată (zile)", "45");
    const saveButton = within(form).getByRole("button", { name: "Salvează datele comerciale" });
    await userEvent.dblClick(saveButton);
    expect(await screen.findByText("Salvat ca revizia 2.")).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ expectedRevision: 1, paymentTermDays: "45", bankAccount: null });
    expect(within(screen.getByRole("region", { name: "Condiții" })).getByText("45 de zile")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/revizia 2 · .* · 1 versiune anterioară păstrată/)).toBeInTheDocument());
  });

  it("keeps every value after a failure and a refused field, then saves on retry", async () => {
    render(<Harness />);
    const form = await openForm();
    await setValue(form, "Email contact facturare", "facturare@alpha-clima");
    next = [{ status: 503 }, { status: 400, field: "billingContactEmail" }];
    await userEvent.click(within(form).getByRole("button", { name: "Salvează datele comerciale" }));
    expect(await within(form).findByText("Nu s-a salvat. Modificările tale au rămas în formular.")).toBeInTheDocument();
    expect(within(form).getByText(/Datele comerciale salvate au rămas cele din revizia 1/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Email contact facturare")).toHaveValue("facturare@alpha-clima");
    await userEvent.click(within(form).getByRole("button", { name: "Reîncearcă salvarea" }));
    expect(await within(form).findByText("Verifică valorile completate: Email contact facturare.")).toBeInTheDocument();
    const email = within(form).getByLabelText("Email contact facturare");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Adresa de email nu este completă (ex. nume@firma.ro).");
    await waitFor(() => expect(email).toHaveFocus());
    await setValue(form, "Email contact facturare", "facturare@alpha-clima.demo.ro");
    await userEvent.click(within(form).getByRole("button", { name: "Salvează datele comerciale" }));
    expect(await screen.findByText("Salvat ca revizia 2.")).toBeInTheDocument();
    expect(puts).toHaveLength(3);
  });
});

describe("Date comerciale · conflicts (754:26646 → 754:26844 → 754:27045 → 767:185)", () => {
  it("keeps the draft through two conflicts, resumes on the current version and saves exactly the result", async () => {
    render(<Harness />);
    const form = await openForm();
    await setValue(form, "Termen de plată (zile)", "45");
    // Someone else saves 60 days and a new billing phone in between.
    next = [{ status: 409, then: () => record({ paymentTermDays: 60, billingContactPhone: "0700 900 119" }) }];
    await userEvent.click(within(form).getByRole("button", { name: "Salvează datele comerciale" }));
    expect(await within(form).findByText(/Altcineva a salvat între timp revizia 2/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Termen de plată (zile)")).toHaveValue("45");
    await userEvent.click(within(form).getByRole("button", { name: "Compară cu revizia 2" }));
    const compare = await screen.findByRole("table");
    await waitFor(() => expect(compare.closest(".dcom-compare")).toHaveFocus());
    const rows = within(compare).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(["Termen de plată (zile)304560", "Telefon contact facturare0700 900 1110700 900 111 (neschimbat de tine)0700 900 119"]);
    expect(rows[0]).toHaveAttribute("data-both", "true");
    expect(screen.getByText(/„Termen de plată” a fost modificat și de tine, și de altcineva\. La reluare păstrăm valoarea ta \(45\)/)).toBeInTheDocument();
    // Nothing is saved by choosing.
    await userEvent.click(screen.getByRole("button", { name: "Reia editarea pe revizia 2 cu modificările mele" }));
    expect(puts).toHaveLength(1);
    const resumed = screen.getByRole("form", { name: "Modifică datele comerciale" });
    expect(within(resumed).getByLabelText("Termen de plată (zile)")).toHaveValue("45");
    expect(within(resumed).getByLabelText("Termen de plată (zile)")).toHaveAccessibleDescription("Valoarea ta (45). Revizia 2 avea 60 — verifică-o înainte de salvare.");
    expect(within(resumed).getByLabelText("Telefon contact facturare")).toHaveValue("0700 900 119");
    expect(within(resumed).getByText("Editezi acum pe revizia 2. Nimic nu e salvat încă.")).toBeInTheDocument();
    // A second conflict: the same steps from the newest version, the draft still there.
    next = [{ status: 409, then: () => record({ currency: "EUR" }) }];
    await userEvent.click(within(resumed).getByRole("button", { name: "Salvează datele comerciale" }));
    expect(await within(resumed).findByText(/Altcineva a salvat între timp revizia 3/)).toBeInTheDocument();
    await userEvent.click(within(resumed).getByRole("button", { name: "Compară cu revizia 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Reia editarea pe revizia 3 cu modificările mele" }));
    const again = screen.getByRole("form", { name: "Modifică datele comerciale" });
    expect(within(again).getByLabelText("Termen de plată (zile)")).toHaveValue("45");
    expect(within(again).getByLabelText("Monedă")).toHaveValue("EUR");
    await userEvent.click(within(again).getByRole("button", { name: "Salvează datele comerciale" }));
    expect(await screen.findByText("Salvat ca revizia 4.")).toBeInTheDocument();
    // What was kept and what was taken, from which version — through both conflicts (783:31110).
    expect(screen.getByText("Termen de plată 45 de zile (valoarea ta) · Telefon contact facturare 0700 900 119 (din revizia 2) · Monedă EUR (din revizia 3).")).toBeInTheDocument();
    expect(puts.map((body) => body.expectedRevision)).toEqual([1, 2, 3]);
    const conditions = screen.getByRole("region", { name: "Condiții" });
    expect(within(conditions).getByText("45 de zile")).toBeInTheDocument();
    expect(within(conditions).getByText("EUR")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Contacte" })).getByText("0700 900 119")).toBeInTheDocument();
  });

  it("„Folosește revizia 2” shows the current version and saves nothing", async () => {
    render(<Harness />);
    const form = await openForm();
    await setValue(form, "Termen de plată (zile)", "45");
    next = [{ status: 409, then: () => record({ paymentTermDays: 60 }) }];
    await userEvent.click(within(form).getByRole("button", { name: "Salvează datele comerciale" }));
    await userEvent.click(await within(form).findByRole("button", { name: "Compară cu revizia 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Folosește revizia 2 și renunță la ale mele" }));
    expect(await screen.findByText("Ai renunțat la modificările tale.")).toBeInTheDocument();
    expect(screen.getByText("Afișăm revizia 2, salvată de altcineva: Termen de plată 60 de zile.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Condiții" })).getByText("60 de zile")).toBeInTheDocument();
    expect(puts).toHaveLength(1);
  });
});

describe("Date comerciale · leaving (721:1157)", () => {
  it("leaves a clean form directly and asks, naming the destination, when there are changes", async () => {
    render(<Harness />);
    await openForm();
    act(() => navigate("/clienti/cus-1?sectiune=sedii"));
    expect(screen.queryByText("Ai modificări nesalvate")).toBeNull();
    expect(window.location.search).toBe("?sectiune=sedii");
  });

  it("„Rămân pe pagină” keeps the draft; „Pleacă fără salvare” drops it", async () => {
    render(<Harness />);
    const form = await openForm();
    await setValue(form, "Termen de plată (zile)", "45");
    act(() => navigate("/clienti/cus-1?sectiune=sedii"));
    const dialog = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    expect(within(dialog).getByText(/Dacă pleci spre Sedii/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Rămân pe pagină" }));
    expect(window.location.search).toBe("?sectiune=comercial");
    expect(within(form).getByLabelText("Termen de plată (zile)")).toHaveValue("45");
    act(() => navigate("/clienti/cus-1?sectiune=sedii"));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Ai modificări nesalvate" })).getByRole("button", { name: "Pleacă fără salvare" }));
    expect(window.location.search).toBe("?sectiune=sedii");
    expect(puts).toHaveLength(0);
  });
});

describe("Date comerciale · phone (783:31001 → 726:1766)", () => {
  it("edits over the whole screen and asks before closing with changes", async () => {
    phoneScreen(true);
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifică datele" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifică datele comerciale" });
    expect(within(dialog).getByText("Alpha Clima Demo SRL · revizia 1")).toBeInTheDocument();
    await setValue(dialog, "Termen de plată (zile)", "45");
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide formularul" }));
    expect(within(dialog).getByText("Ai modificări nesalvate")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Rămân pe pagină" }));
    expect(within(dialog).getByLabelText("Termen de plată (zile)")).toHaveValue("45");
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide formularul" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvează și continuă" }));
    expect(await screen.findByText("Salvat ca revizia 2.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Modifică datele comerciale" })).toBeNull();
  });
});

describe("Date comerciale · the contractual documents in Documente (etapa 8 · corecție)", () => {
  const CONTRACTS = "/clienti/cus-1?sectiune=documente&tip=CONTRACT%2CADDENDUM";

  it("always opens Documente filtered on Contract + Act adițional, whatever the client has", async () => {
    for (const [set, summary] of [
      [[invoice], "Niciun contract sau act adițional încărcat. Se încarcă din Documente."],
      [[contract, invoice], "Contractele și actele adiționale ale clientului sunt în Documente: 1 contract."],
      [[addendum, invoice], "Contractele și actele adiționale ale clientului sunt în Documente: 1 act adițional."],
      [[contract, addendum, invoice], "Contractele și actele adiționale ale clientului sunt în Documente: 1 contract · 1 act adițional."],
    ] as const) {
      documents = [...set];
      resetResourceCache();
      const view = render(<Harness />);
      expect(await screen.findByText(summary)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Deschide în Documente →" })).toHaveAttribute("href", CONTRACTS);
      view.unmount();
    }
  });

  it("a client with invoices only: zero contractual results, the filter in view and removable, then back with the focus", async () => {
    versions = [];
    documents = [invoice];
    render(<Harness />);
    const link = await screen.findByRole("link", { name: "Deschide în Documente →" });
    link.focus();
    await userEvent.click(link);
    expect(window.location.search).toBe("?sectiune=documente&tip=CONTRACT%2CADDENDUM");
    // The combined filter is named in the filter control, not only applied to the list.
    expect(await screen.findByRole("button", { name: /Tip · Contract, Act adițional/ })).toHaveAttribute("data-active", "true");
    expect(screen.getAllByText(/Tip: Contract, Act adițional/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Factură avans")).toBeNull();
    // R1: the combined filter is one chip; removing it brings every document back.
    await userEvent.click(screen.getByRole("button", { name: "Elimină filtrul Tip: Contract, Act adițional" }));
    expect(await screen.findByText("Factură avans")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tip/ })).not.toHaveAttribute("data-active");
    // Back to the commercial terms: the same section with its link. (The focus on that link is restored
    // by the app-level navigation memory — `data-row-id`, navigationMemory.test — and checked in the browser.)
    act(() => window.history.back());
    await waitFor(() => expect(window.location.search).toBe("?sectiune=comercial"));
    expect(await screen.findByRole("link", { name: "Deschide în Documente →" })).toHaveAttribute("data-row-id", "comercial:documente-contractuale");
  });
});
