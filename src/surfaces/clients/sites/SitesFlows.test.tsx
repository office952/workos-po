import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 etapa 7 · Sedii: editing with a failed save and two version conflicts (compare, resume),
 * deactivation with a failure, a retry and a conflict, reactivation, read-only access and a client
 * without sites — through the server's routes (mocked here).
 */
type Reply = { status: number; body?: unknown };
const reply = ({ status, body = null }: Reply) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([""]), headers: new Headers() });

const baseSite = () => ({ siteId: "s1", name: "Depozit Ghimbav", address: "DN1 km 7, Zona Industrială", city: "Ghimbav", contactName: "Sorin Dinu", phone: "0700 900 120", accessNotes: "Acces camion pe poarta 2.", status: "ACTIVE", statusLabel: "Activ", revision: 1, usage: { requests: 1, jobs: 0, historicalWorks: 2, documents: 1 } });

let sites: Array<ReturnType<typeof baseSite>>;
let editSites: boolean;
let calls: Array<{ method: string; url: string; body?: Record<string, unknown> }>;
let patches: Array<{ status: number; then?: () => void }>;

const dossierBody = () => ({
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [], photoStages: [], historyStates: [], maxFileBytes: 1 },
    sites,
    siteAssignments: [{ subjectKind: "REQUEST", subjectId: "r1", siteId: "s1" }],
    documents: [],
    historicalWorks: [],
    linkTargets: { requests: [{ subjectId: "r1", label: "CER-4C3E1233 · Casetă luminoasă depozit Alpha" }], jobs: [], historicalWorks: [], sites: [] },
  },
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
  sites = [baseSite()];
  editSites = true;
  calls = [];
  patches = [];
  sessionStorage.clear();
  window.history.replaceState({}, "", "/clienti/cus-1?sectiune=sedii");
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
      calls.push({ method, url, body });
      if (url.endsWith("/workspace")) {
        return reply({ status: 200, body: { workspace: { customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" }, canCreateRequest: true, summary: { requestCount: 1, openRequestCount: 1, quoteCount: 0, jobCount: 0, historicalWorkCount: 2, workCount: 2 }, requests: [], quotes: [], jobs: [] } } });
      }
      if (url.endsWith("/dossier")) return reply({ status: 200, body: dossierBody() });
      if (url.includes("/history")) return reply({ status: 200, body: { customerId: "cus-1", history: { total: 0, page: 1, pageCount: 1, entries: [], totals: { entries: 0, projects: 0, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: sites.map((site) => ({ siteId: site.siteId, name: site.name, active: site.status === "ACTIVE", count: 0 })) } } } });
      if (url.includes("/works")) return reply({ status: 200, body: { works: { total: 0, page: 1, pageCount: 1, items: [], totals: { all: 0, workos: 0, historical: 0 }, facets: { years: [], yearCounts: [], states: [], sites: [] } } } });
      if (url.endsWith("/commercial-terms")) return reply({ status: 200, body: { terms: { revision: 1, recordedAt: null }, fields: { billingAddress: "Bd. Muncii 45, Brașov" }, labels: {}, currencies: [], revisions: [], canEdit: true } });
      if (method === "PATCH") {
        const next = patches.shift() ?? { status: 200 };
        if (next.status === 409) {
          next.then?.();
          return reply({ status: 409, body: { error: "stale_revision", site: sites[0] } });
        }
        if (next.status >= 400) return reply({ status: next.status, body: { error: "storage_unavailable" } });
        const current = sites[0]!;
        sites = [{ ...current, ...(body ?? {}), revision: current.revision + 1, statusLabel: (body?.status ?? current.status) === "ACTIVE" ? "Activ" : "Inactiv" } as ReturnType<typeof baseSite>];
        return reply({ status: 200, body: { site: sites[0] } });
      }
      if (method === "POST" && url.endsWith("/sites")) return reply({ status: 201, body: { site: { ...baseSite(), siteId: "s2", name: String(body?.name) } } });
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

const card = async (name = "Depozit Ghimbav") => (await screen.findByRole("heading", { level: 3, name })).closest("li")!;

describe("Sedii · editing (715:925 → 755:374 → 755:685 → 773:829)", () => {
  it("keeps the values on a failure, then resumes on the current version after two conflicts and saves", async () => {
    render(<Harness />);
    expect(await screen.findByText("Adresa de facturare a clientului: Bd. Muncii 45, Brașov · se modifică în Date comerciale")).toBeInTheDocument();
    await userEvent.click(within(await card()).getByRole("button", { name: "Modifică Depozit Ghimbav" }));
    const form = await screen.findByRole("dialog", { name: "Modifică Depozit Ghimbav" });
    const contact = within(form).getByLabelText("Persoană de contact");
    await userEvent.clear(contact);
    await userEvent.type(contact, "Radu Pavel");
    patches = [
      { status: 503 },
      { status: 409, then: () => { sites = [{ ...sites[0]!, accessNotes: "Acces camion pe poarta 3.", revision: 2 }]; } },
      { status: 409, then: () => { sites = [{ ...sites[0]!, phone: "0700 900 199", revision: 3 }]; } },
      { status: 200 },
    ];
    await userEvent.click(within(form).getByRole("button", { name: "Salvează sediul" }));
    expect(await within(form).findByText("Nu s-a salvat")).toBeInTheDocument();
    expect(within(form).getByLabelText("Persoană de contact")).toHaveValue("Radu Pavel");
    await userEvent.click(within(form).getByRole("button", { name: "Salvează sediul" }));
    expect(await within(form).findByText("Altcineva a modificat sediul între timp (revizia 2).")).toBeInTheDocument();
    expect(within(form).getByLabelText("Persoană de contact")).toHaveValue("Radu Pavel");
    await userEvent.click(within(form).getByRole("button", { name: "Compară cu versiunea actuală" }));
    expect(within(form).getByText("Doar câmpurile care diferă")).toBeInTheDocument();
    // The comparison takes the focus: the pressed button is gone.
    await waitFor(() => expect(within(form).getByText("Doar câmpurile care diferă").closest(".ddocform__compare")).toHaveFocus());
    expect(within(form).getByText("Acces camion pe poarta 3.")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Reia editarea pe versiunea actuală" }));
    expect(within(form).getByText("Editezi acum pe versiunea actuală (revizia 2).")).toBeInTheDocument();
    expect(within(form).getByLabelText("Observații acces / montaj")).toHaveValue("Acces camion pe poarta 3.");
    // A second conflict: the draft stays, the same steps from the newest version.
    await userEvent.click(within(form).getByRole("button", { name: "Salvează sediul" }));
    expect(await within(form).findByText("Altcineva a modificat sediul între timp (revizia 3).")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Compară cu versiunea actuală" }));
    await userEvent.click(within(form).getByRole("button", { name: "Reia editarea pe versiunea actuală" }));
    expect(within(form).getByLabelText("Telefon")).toHaveValue("0700 900 199");
    expect(within(form).getByLabelText("Persoană de contact")).toHaveValue("Radu Pavel");
    await userEvent.click(within(form).getByRole("button", { name: "Salvează sediul" }));
    expect(await screen.findByText("„Depozit Ghimbav” a fost salvat.")).toBeInTheDocument();
    const sent = calls.filter((call) => call.method === "PATCH").map((call) => call.body?.expectedRevision);
    expect(sent).toEqual([1, 1, 2, 3]);
    expect(calls.filter((call) => call.method === "PATCH").at(-1)?.body).toMatchObject({ contactName: "Radu Pavel", phone: "0700 900 199", accessNotes: "Acces camion pe poarta 3." });
  });
});

describe("Sedii · deactivation (759:682 → 759:980 → 759:1284 · 759:1132)", () => {
  it("says what changes and what stays, keeps the site on a failure, retries, and reactivates", async () => {
    render(<Harness />);
    await userEvent.click(within(await card()).getByRole("button", { name: "Dezactivează Depozit Ghimbav" }));
    const dialog = await screen.findByRole("dialog", { name: "Dezactivezi „Depozit Ghimbav”?" });
    expect(within(dialog).getByText("Cererea CER-4C3E1233 · Casetă luminoasă depozit Alpha rămâne la acest sediu, cu adresa de atunci.")).toBeInTheDocument();
    expect(within(dialog).getByText(/^Cele 2 lucrări istorice/)).toBeInTheDocument();
    patches = [{ status: 503 }, { status: 200 }];
    await userEvent.click(within(dialog).getByRole("button", { name: "Dezactivează sediul" }));
    expect(await within(dialog).findByText("Dezactivarea nu s-a aplicat. Sediul a rămas activ.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă dezactivarea" }));
    expect(await screen.findByText("„Depozit Ghimbav” a fost dezactivat.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([{ status: "INACTIVE", expectedRevision: 1 }, { status: "INACTIVE", expectedRevision: 1 }]);
    const inactive = await card();
    expect(within(inactive).getByText("INACTIV")).toBeInTheDocument();
    await userEvent.click(within(inactive).getByRole("button", { name: "Reactivează Depozit Ghimbav" }));
    const back = await screen.findByRole("dialog", { name: "Reactivezi „Depozit Ghimbav”?" });
    await userEvent.click(within(back).getByRole("button", { name: "Reactivează sediul" }));
    expect(await screen.findByText("„Depozit Ghimbav” a fost reactivat.")).toBeInTheDocument();
  });

  it("asks again on the current version after a conflict, without deactivating on its own", async () => {
    render(<Harness />);
    await userEvent.click(within(await card()).getByRole("button", { name: "Dezactivează Depozit Ghimbav" }));
    const dialog = await screen.findByRole("dialog", { name: "Dezactivezi „Depozit Ghimbav”?" });
    patches = [{ status: 409, then: () => { sites = [{ ...sites[0]!, name: "Depozit Ghimbav (hala 2)", revision: 2 }]; } }, { status: 200 }];
    await userEvent.click(within(dialog).getByRole("button", { name: "Dezactivează sediul" }));
    expect(await screen.findByText("Sediul a fost modificat între timp de altcineva (revizia 2).")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Dezactivează versiunea actuală" }));
    await waitFor(() => expect(calls.filter((call) => call.method === "PATCH").at(-1)?.body).toEqual({ status: "INACTIVE", expectedRevision: 2 }));
  });
});

describe("Sedii · access and states (716:682 · 716:185)", () => {
  it("shows no add, change or deactivate without the right to edit sites", async () => {
    editSites = false;
    render(<Harness />);
    const site = await card();
    expect(within(site).queryByRole("button", { name: /Modifică|Dezactivează/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Adaugă sediu/ })).toBeNull();
    expect(within(site).getByRole("link", { name: /^Istoric · 0/ })).toBeInTheDocument();
  });

  it("says when the client has no site", async () => {
    sites = [];
    render(<Harness />);
    expect(await screen.findByText("Niciun sediu")).toBeInTheDocument();
  });
});
